import {
  MediatorConfig,
  EscalationDeclaration,
  EscalationAuthority,
  EscalationAuthorityType,
} from '../types';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Escalation submission result
 */
export interface EscalationSubmissionResult {
  escalationId: string;
  submitted: boolean;
  submittedAt?: number;
  confirmationId?: string;
  error?: string;
}

/**
 * Manages escalation declarations and authority registry
 * Handles submission to external authorities when disputes cannot be resolved
 */
export class EscalationManager {
  private config: MediatorConfig;
  private escalations: Map<string, EscalationDeclaration> = new Map();
  private authorities: Map<string, EscalationAuthority> = new Map();
  private submissions: Map<string, EscalationSubmissionResult> = new Map();
  private dataPath: string;

  constructor(config: MediatorConfig, dataPath: string = './data/escalations') {
    this.config = config;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing escalations and authorities
    this.loadEscalations();
    this.loadAuthorities();

    // Register default authorities if configured
    this.registerDefaultAuthorities();

    logger.info('EscalationManager initialized', {
      dataPath,
      escalationsLoaded: this.escalations.size,
      authoritiesLoaded: this.authorities.size,
    });
  }

  /**
   * Register an escalation authority
   */
  public registerAuthority(params: {
    authorityType: EscalationAuthorityType;
    name: string;
    description?: string;
    contactInfo?: string;
    jurisdiction?: string;
    website?: string;
  }): { success: boolean; authorityId?: string; error?: string } {
    try {
      // Validate required fields
      if (!params.name || params.name.trim().length === 0) {
        return {
          success: false,
          error: 'Authority name is required',
        };
      }

      // Check if authority with same name already exists
      const existing = Array.from(this.authorities.values()).find(
        (a) => a.name.toLowerCase() === params.name.toLowerCase()
      );

      if (existing) {
        return {
          success: false,
          error: `Authority with name "${params.name}" already exists`,
        };
      }

      const authorityId = nanoid();
      const authority: EscalationAuthority = {
        authorityId,
        ...params,
      };

      this.authorities.set(authorityId, authority);
      this.saveAuthority(authority);

      logger.info('Escalation authority registered', {
        authorityId,
        name: params.name,
        type: params.authorityType,
      });

      return {
        success: true,
        authorityId,
      };
    } catch (error) {
      logger.error('Error registering authority', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Initiate an escalation
   */
  public async initiateEscalation(params: {
    disputeId: string;
    escalatedBy: string;
    targetAuthorityId: string;
    scopeOfIssues: string[];
    signature?: string;
    packageId?: string;
  }): Promise<{
    success: boolean;
    escalationId?: string;
    error?: string;
  }> {
    try {
      const {
        disputeId,
        escalatedBy,
        targetAuthorityId,
        scopeOfIssues,
        signature,
        packageId,
      } = params;

      // Validate inputs
      if (!scopeOfIssues || scopeOfIssues.length === 0) {
        return {
          success: false,
          error: 'Scope of issues cannot be empty',
        };
      }

      // Verify authority exists
      const authority = this.authorities.get(targetAuthorityId);
      if (!authority) {
        return {
          success: false,
          error: 'Target authority not found',
        };
      }

      // Check if escalation already exists for this dispute to this authority
      const existing = Array.from(this.escalations.values()).find(
        (e) =>
          e.disputeId === disputeId &&
          e.targetAuthority.authorityId === targetAuthorityId
      );

      if (existing) {
        return {
          success: false,
          error: 'Escalation to this authority already exists for this dispute',
        };
      }

      // Require human escalation if configured
      if (this.config.requireHumanEscalation !== false && !signature) {
        logger.warn('Human escalation required but no signature provided', {
          disputeId,
        });
      }

      const escalationId = nanoid();
      const now = Date.now();

      const escalation: EscalationDeclaration = {
        escalationId,
        disputeId,
        escalatedBy,
        targetAuthority: authority,
        scopeOfIssues,
        escalatedAt: now,
        humanAuthorship: !!signature, // True if signature provided
        signature,
        packageId,
      };

      this.escalations.set(escalationId, escalation);
      this.saveEscalation(escalation);

      logger.info('Escalation initiated', {
        escalationId,
        disputeId,
        authority: authority.name,
        scopeIssues: scopeOfIssues.length,
      });

      return {
        success: true,
        escalationId,
      };
    } catch (error) {
      logger.error('Error initiating escalation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Submit escalation to target authority
   */
  public async submitEscalation(
    escalationId: string
  ): Promise<EscalationSubmissionResult> {
    try {
      const escalation = this.escalations.get(escalationId);

      if (!escalation) {
        return {
          escalationId,
          submitted: false,
          error: 'Escalation not found',
        };
      }

      // Check if already submitted
      const existingSubmission = this.submissions.get(escalationId);
      if (existingSubmission?.submitted) {
        return {
          ...existingSubmission,
          error: 'Escalation already submitted',
        };
      }

      // Format escalation for submission
      const submissionPayload = this.formatEscalationForSubmission(escalation);

      // Attempt submission to authority
      let confirmationId: string | undefined;
      let submitted = false;

      if (escalation.targetAuthority.contactInfo) {
        try {
          // Try to submit via HTTP if contact info is a URL
          if (
            escalation.targetAuthority.contactInfo.startsWith('http://') ||
            escalation.targetAuthority.contactInfo.startsWith('https://')
          ) {
            const response = await axios.post(
              escalation.targetAuthority.contactInfo,
              submissionPayload,
              {
                timeout: 10000,
                headers: {
                  'Content-Type': 'application/json',
                },
              }
            );

            if (response.status === 200 || response.status === 201) {
              submitted = true;
              confirmationId = response.data.confirmationId || nanoid();
            }
          }
        } catch (error) {
          logger.warn('Failed to submit escalation to authority endpoint', {
            escalationId,
            error: String(error),
          });
        }
      }

      // Record submission result
      const result: EscalationSubmissionResult = {
        escalationId,
        submitted,
        submittedAt: Date.now(),
        confirmationId,
        error: submitted ? undefined : 'Submission to authority failed',
      };

      this.submissions.set(escalationId, result);
      this.saveSubmission(result);

      logger.info('Escalation submission attempted', {
        escalationId,
        submitted,
        confirmationId,
      });

      return result;
    } catch (error) {
      logger.error('Error submitting escalation', { error });
      return {
        escalationId,
        submitted: false,
        error: String(error),
      };
    }
  }

  /**
   * Get escalation by ID
   */
  public getEscalation(escalationId: string): EscalationDeclaration | undefined {
    return this.escalations.get(escalationId);
  }

  /**
   * Get all escalations for a dispute
   */
  public getEscalationsForDispute(disputeId: string): EscalationDeclaration[] {
    return Array.from(this.escalations.values()).filter(
      (e) => e.disputeId === disputeId
    );
  }

  /**
   * Get authority by ID
   */
  public getAuthority(authorityId: string): EscalationAuthority | undefined {
    return this.authorities.get(authorityId);
  }

  /**
   * Get all registered authorities
   */
  public getAllAuthorities(): EscalationAuthority[] {
    return Array.from(this.authorities.values());
  }

  /**
   * Get authorities by type
   */
  public getAuthoritiesByType(
    type: EscalationAuthorityType
  ): EscalationAuthority[] {
    return Array.from(this.authorities.values()).filter(
      (a) => a.authorityType === type
    );
  }

  /**
   * Get submission result
   */
  public getSubmission(escalationId: string): EscalationSubmissionResult | undefined {
    return this.submissions.get(escalationId);
  }

  /**
   * Update authority information
   */
  public updateAuthority(
    authorityId: string,
    updates: Partial<Omit<EscalationAuthority, 'authorityId'>>
  ): boolean {
    const authority = this.authorities.get(authorityId);

    if (!authority) {
      return false;
    }

    Object.assign(authority, updates);
    this.saveAuthority(authority);

    logger.info('Authority updated', { authorityId });

    return true;
  }

  /**
   * Remove an authority
   */
  public removeAuthority(authorityId: string): boolean {
    const authority = this.authorities.get(authorityId);

    if (!authority) {
      return false;
    }

    // Check if any escalations reference this authority
    const hasEscalations = Array.from(this.escalations.values()).some(
      (e) => e.targetAuthority.authorityId === authorityId
    );

    if (hasEscalations) {
      logger.warn('Cannot remove authority with existing escalations', {
        authorityId,
      });
      return false;
    }

    this.authorities.delete(authorityId);

    // Delete file
    try {
      const filePath = path.join(
        this.dataPath,
        'authorities',
        `${authorityId}.json`
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.error('Error deleting authority file', { authorityId, error });
    }

    logger.info('Authority removed', { authorityId });

    return true;
  }

  /**
   * Format escalation for submission
   */
  private formatEscalationForSubmission(
    escalation: EscalationDeclaration
  ): string {
    return `[ESCALATION DECLARATION]

Escalation ID: ${escalation.escalationId}
Dispute ID: ${escalation.disputeId}
Escalated By: ${escalation.escalatedBy}
Escalated At: ${new Date(escalation.escalatedAt).toISOString()}

TARGET AUTHORITY:
- Name: ${escalation.targetAuthority.name}
- Type: ${escalation.targetAuthority.authorityType}
${escalation.targetAuthority.jurisdiction ? `- Jurisdiction: ${escalation.targetAuthority.jurisdiction}` : ''}
${escalation.targetAuthority.contactInfo ? `- Contact: ${escalation.targetAuthority.contactInfo}` : ''}

SCOPE OF ISSUES:
${escalation.scopeOfIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

HUMAN AUTHORSHIP: ${escalation.humanAuthorship ? 'Verified' : 'Not Verified'}
${escalation.signature ? `SIGNATURE: ${escalation.signature}` : ''}
${escalation.packageId ? `PACKAGE ID: ${escalation.packageId}` : ''}

This escalation has been submitted to your authority for review and resolution.
The parties were unable to reach agreement through mediation and clarification.
`;
  }

  /**
   * Register default authorities based on configuration
   */
  private registerDefaultAuthorities(): void {
    // Can be extended to load from config
    // For now, this is a placeholder for future configuration-based authority registration
  }

  /**
   * Save escalation to disk
   */
  private saveEscalation(escalation: EscalationDeclaration): void {
    try {
      const filePath = path.join(this.dataPath, `${escalation.escalationId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(escalation, null, 2));
    } catch (error) {
      logger.error('Error saving escalation', {
        escalationId: escalation.escalationId,
        error,
      });
    }
  }

  /**
   * Save authority to disk
   */
  private saveAuthority(authority: EscalationAuthority): void {
    try {
      const authoritiesDir = path.join(this.dataPath, 'authorities');
      if (!fs.existsSync(authoritiesDir)) {
        fs.mkdirSync(authoritiesDir, { recursive: true });
      }

      const filePath = path.join(authoritiesDir, `${authority.authorityId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(authority, null, 2));
    } catch (error) {
      logger.error('Error saving authority', {
        authorityId: authority.authorityId,
        error,
      });
    }
  }

  /**
   * Save submission result to disk
   */
  private saveSubmission(submission: EscalationSubmissionResult): void {
    try {
      const submissionsDir = path.join(this.dataPath, 'submissions');
      if (!fs.existsSync(submissionsDir)) {
        fs.mkdirSync(submissionsDir, { recursive: true });
      }

      const filePath = path.join(submissionsDir, `${submission.escalationId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(submission, null, 2));
    } catch (error) {
      logger.error('Error saving submission', {
        escalationId: submission.escalationId,
        error,
      });
    }
  }

  /**
   * Load escalations from disk
   */
  private loadEscalations(): void {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return;
      }

      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('/')) {
          const filePath = path.join(this.dataPath, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const escalation: EscalationDeclaration = JSON.parse(data);
          this.escalations.set(escalation.escalationId, escalation);
        }
      }

      logger.info('Escalations loaded from disk', {
        count: this.escalations.size,
      });
    } catch (error) {
      logger.error('Error loading escalations', { error });
    }
  }

  /**
   * Load authorities from disk
   */
  private loadAuthorities(): void {
    try {
      const authoritiesDir = path.join(this.dataPath, 'authorities');
      if (!fs.existsSync(authoritiesDir)) {
        return;
      }

      const files = fs.readdirSync(authoritiesDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(authoritiesDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const authority: EscalationAuthority = JSON.parse(data);
          this.authorities.set(authority.authorityId, authority);
        }
      }

      // Load submissions
      const submissionsDir = path.join(this.dataPath, 'submissions');
      if (fs.existsSync(submissionsDir)) {
        const submissionFiles = fs.readdirSync(submissionsDir);
        for (const file of submissionFiles) {
          if (file.endsWith('.json')) {
            const filePath = path.join(submissionsDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const submission: EscalationSubmissionResult = JSON.parse(data);
            this.submissions.set(submission.escalationId, submission);
          }
        }
      }

      logger.info('Authorities loaded from disk', {
        count: this.authorities.size,
      });
    } catch (error) {
      logger.error('Error loading authorities', { error });
    }
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalEscalations: number;
    totalAuthorities: number;
    authoritiesByType: Record<EscalationAuthorityType, number>;
    escalationsSubmitted: number;
    escalationsPending: number;
    humanAuthorshipVerified: number;
  } {
    const authoritiesByType: Record<EscalationAuthorityType, number> = {
      arbitrator: 0,
      dao: 0,
      court: 0,
      review_board: 0,
      custom: 0,
    };

    for (const authority of this.authorities.values()) {
      authoritiesByType[authority.authorityType]++;
    }

    let escalationsSubmitted = 0;
    let escalationsPending = 0;
    let humanAuthorshipVerified = 0;

    for (const escalation of this.escalations.values()) {
      const submission = this.submissions.get(escalation.escalationId);
      if (submission?.submitted) {
        escalationsSubmitted++;
      } else {
        escalationsPending++;
      }

      if (escalation.humanAuthorship) {
        humanAuthorshipVerified++;
      }
    }

    return {
      totalEscalations: this.escalations.size,
      totalAuthorities: this.authorities.size,
      authoritiesByType,
      escalationsSubmitted,
      escalationsPending,
      humanAuthorshipVerified,
    };
  }
}
