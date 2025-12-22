import {
  MediatorConfig,
  ScopeViolation,
  ViolationType,
  License,
  Delegation,
  DelegatedAction,
} from '../types';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { LicenseManager } from './LicenseManager';
import { DelegationManager } from './DelegationManager';

/**
 * Violation recording parameters
 */
export interface ViolationParams {
  type: ViolationType;
  licenseId?: string;
  delegationId?: string;
  violatorId: string;
  violationDescription: string;
  evidence?: string[];
}

/**
 * Tracks scope violations and authority abuse
 * Integrates with MP-03 for dispute escalation
 * Implements MP-04 abuse detection
 */
export class AuthorityTracker {
  private config: MediatorConfig;
  private violations: Map<string, ScopeViolation> = new Map();
  private dataPath: string;
  private licenseManager?: LicenseManager;
  private delegationManager?: DelegationManager;

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/violations',
    licenseManager?: LicenseManager,
    delegationManager?: DelegationManager
  ) {
    this.config = config;
    this.dataPath = dataPath;
    this.licenseManager = licenseManager;
    this.delegationManager = delegationManager;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing violations
    this.loadViolations();

    logger.info('AuthorityTracker initialized', {
      dataPath,
      violationsLoaded: this.violations.size,
    });
  }

  /**
   * Record a scope violation
   */
  public recordViolation(params: ViolationParams): {
    success: boolean;
    violationId?: string;
    error?: string;
  } {
    try {
      // Validate required fields
      if (!params.violatorId) {
        return {
          success: false,
          error: 'Violator ID is required',
        };
      }

      if (!params.violationDescription || params.violationDescription.trim().length === 0) {
        return {
          success: false,
          error: 'Violation description is required',
        };
      }

      // Validate that at least one of licenseId or delegationId is provided
      if (!params.licenseId && !params.delegationId) {
        return {
          success: false,
          error: 'Either licenseId or delegationId must be provided',
        };
      }

      const violationId = nanoid();
      const now = Date.now();

      const violation: ScopeViolation = {
        violationId,
        type: params.type,
        licenseId: params.licenseId,
        delegationId: params.delegationId,
        violatorId: params.violatorId,
        violationDescription: params.violationDescription,
        detectedAt: now,
        evidence: params.evidence,
      };

      // Store violation
      this.violations.set(violationId, violation);
      this.saveViolation(violation);

      logger.warn('Scope violation recorded', {
        violationId,
        type: params.type,
        violatorId: params.violatorId,
        licenseId: params.licenseId,
        delegationId: params.delegationId,
      });

      return {
        success: true,
        violationId,
      };
    } catch (error) {
      logger.error('Error recording violation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Check license scope compliance
   * Verifies if usage matches license scope
   */
  public checkLicenseCompliance(params: {
    licenseId: string;
    usageType: string;
    usageDescription: string;
    performedBy: string;
  }): {
    compliant: boolean;
    violation?: ScopeViolation;
    reason?: string;
  } {
    if (!this.licenseManager) {
      return {
        compliant: false,
        reason: 'License manager not configured',
      };
    }

    const license = this.licenseManager.getLicense(params.licenseId);

    if (!license) {
      return {
        compliant: false,
        reason: 'License not found',
      };
    }

    // Check license status
    if (license.status !== 'active') {
      const violationType: ViolationType =
        license.status === 'expired' ? 'expired_authority' : 'revoked_authority';

      const violation = this.recordViolation({
        type: violationType,
        licenseId: params.licenseId,
        violatorId: params.performedBy,
        violationDescription: `Attempted to use ${license.status} license. Usage: ${params.usageDescription}`,
        evidence: [params.usageType],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: `License is ${license.status}`,
      };
    }

    // Check if usage matches purpose
    const usageText = `${params.usageType} ${params.usageDescription}`.toLowerCase();
    const purpose = license.scope.purpose.toLowerCase();

    const matchesPurpose = usageText.includes(purpose) || purpose.includes(usageText);

    if (!matchesPurpose) {
      const violation = this.recordViolation({
        type: 'purpose_violation',
        licenseId: params.licenseId,
        violatorId: params.performedBy,
        violationDescription: `Usage does not match licensed purpose. Purpose: "${license.scope.purpose}", Actual usage: "${params.usageDescription}"`,
        evidence: [params.usageType, params.usageDescription],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: 'Usage does not match licensed purpose',
      };
    }

    // Check if usage violates any limits
    for (const limit of license.scope.limits) {
      if (usageText.includes(limit.toLowerCase())) {
        const violation = this.recordViolation({
          type: 'license_scope_violation',
          licenseId: params.licenseId,
          violatorId: params.performedBy,
          violationDescription: `Usage violates license limit: "${limit}". Actual usage: "${params.usageDescription}"`,
          evidence: [params.usageType, params.usageDescription, limit],
        });

        return {
          compliant: false,
          violation: violation.violationId
            ? this.violations.get(violation.violationId)
            : undefined,
          reason: `Usage violates license limit: ${limit}`,
        };
      }
    }

    return {
      compliant: true,
    };
  }

  /**
   * Check delegation scope compliance
   * Verifies if action is within delegation scope
   */
  public checkDelegationCompliance(params: {
    delegationId: string;
    actionType: string;
    actionDescription: string;
    performedBy: string;
  }): {
    compliant: boolean;
    violation?: ScopeViolation;
    reason?: string;
  } {
    if (!this.delegationManager) {
      return {
        compliant: false,
        reason: 'Delegation manager not configured',
      };
    }

    const delegation = this.delegationManager.getDelegation(params.delegationId);

    if (!delegation) {
      return {
        compliant: false,
        reason: 'Delegation not found',
      };
    }

    // Check delegation status
    if (delegation.status !== 'active') {
      const violationType: ViolationType =
        delegation.status === 'expired' ? 'expired_authority' : 'revoked_authority';

      const violation = this.recordViolation({
        type: violationType,
        delegationId: params.delegationId,
        violatorId: params.performedBy,
        violationDescription: `Attempted to use ${delegation.status} delegation. Action: ${params.actionDescription}`,
        evidence: [params.actionType],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: `Delegation is ${delegation.status}`,
      };
    }

    // Check if performer is the delegate
    if (params.performedBy !== delegation.delegateId) {
      const violation = this.recordViolation({
        type: 'unauthorized_redelegation',
        delegationId: params.delegationId,
        violatorId: params.performedBy,
        violationDescription: `Unauthorized actor attempted delegated action. Expected delegate: ${delegation.delegateId}, Actual: ${params.performedBy}`,
        evidence: [params.actionType, params.actionDescription],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: 'Performer is not the authorized delegate',
      };
    }

    const actionText = `${params.actionType} ${params.actionDescription}`.toLowerCase();

    // Check if action matches delegated powers
    const matchesPower = delegation.scope.delegatedPowers.some((power) =>
      actionText.includes(power.toLowerCase())
    );

    if (!matchesPower) {
      const violation = this.recordViolation({
        type: 'license_scope_violation',
        delegationId: params.delegationId,
        violatorId: params.performedBy,
        violationDescription: `Action outside delegated powers. Powers: ${delegation.scope.delegatedPowers.join(', ')}, Action: ${params.actionDescription}`,
        evidence: [params.actionType, params.actionDescription],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: 'Action does not match any delegated powers',
      };
    }

    // Check if action violates constraints
    const violatesConstraint = delegation.scope.constraints.some((constraint) =>
      actionText.includes(constraint.toLowerCase())
    );

    if (violatesConstraint) {
      const violation = this.recordViolation({
        type: 'license_scope_violation',
        delegationId: params.delegationId,
        violatorId: params.performedBy,
        violationDescription: `Action violates delegation constraints. Constraints: ${delegation.scope.constraints.join(', ')}, Action: ${params.actionDescription}`,
        evidence: [params.actionType, params.actionDescription],
      });

      return {
        compliant: false,
        violation: violation.violationId
          ? this.violations.get(violation.violationId)
          : undefined,
        reason: 'Action violates delegation constraints',
      };
    }

    return {
      compliant: true,
    };
  }

  /**
   * Link violation to MP-03 dispute
   */
  public linkViolationToDispute(violationId: string, disputeId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const violation = this.violations.get(violationId);

      if (!violation) {
        return {
          success: false,
          error: 'Violation not found',
        };
      }

      violation.disputeId = disputeId;
      this.saveViolation(violation);

      logger.info('Violation linked to dispute', {
        violationId,
        disputeId,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error linking violation to dispute', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get violation by ID
   */
  public getViolation(violationId: string): ScopeViolation | undefined {
    return this.violations.get(violationId);
  }

  /**
   * Get violations for a license
   */
  public getViolationsForLicense(licenseId: string): ScopeViolation[] {
    return Array.from(this.violations.values()).filter(
      (violation) => violation.licenseId === licenseId
    );
  }

  /**
   * Get violations for a delegation
   */
  public getViolationsForDelegation(delegationId: string): ScopeViolation[] {
    return Array.from(this.violations.values()).filter(
      (violation) => violation.delegationId === delegationId
    );
  }

  /**
   * Get violations by violator
   */
  public getViolationsByViolator(violatorId: string): ScopeViolation[] {
    return Array.from(this.violations.values()).filter(
      (violation) => violation.violatorId === violatorId
    );
  }

  /**
   * Get violations by type
   */
  public getViolationsByType(type: ViolationType): ScopeViolation[] {
    return Array.from(this.violations.values()).filter((violation) => violation.type === type);
  }

  /**
   * Get violations escalated to disputes
   */
  public getEscalatedViolations(): ScopeViolation[] {
    return Array.from(this.violations.values()).filter(
      (violation) => violation.disputeId !== undefined
    );
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalViolations: number;
    violationsByType: Record<ViolationType, number>;
    escalatedViolations: number;
    violationsByLicense: number;
    violationsByDelegation: number;
    uniqueViolators: number;
  } {
    const violationsByType: Record<ViolationType, number> = {
      license_scope_violation: 0,
      unauthorized_redelegation: 0,
      purpose_violation: 0,
      expired_authority: 0,
      revoked_authority: 0,
    };

    let escalatedCount = 0;
    let licenseViolationCount = 0;
    let delegationViolationCount = 0;
    const violators = new Set<string>();

    for (const violation of this.violations.values()) {
      violationsByType[violation.type]++;

      if (violation.disputeId) {
        escalatedCount++;
      }

      if (violation.licenseId) {
        licenseViolationCount++;
      }

      if (violation.delegationId) {
        delegationViolationCount++;
      }

      violators.add(violation.violatorId);
    }

    return {
      totalViolations: this.violations.size,
      violationsByType,
      escalatedViolations: escalatedCount,
      violationsByLicense: licenseViolationCount,
      violationsByDelegation: delegationViolationCount,
      uniqueViolators: violators.size,
    };
  }

  /**
   * Save violation to disk
   */
  private saveViolation(violation: ScopeViolation): void {
    const filePath = path.join(this.dataPath, `${violation.violationId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(violation, null, 2));
    } catch (error) {
      logger.error('Error saving violation', {
        violationId: violation.violationId,
        error,
      });
    }
  }

  /**
   * Load all violations from disk
   */
  private loadViolations(): void {
    if (!fs.existsSync(this.dataPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.dataPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const violation: ScopeViolation = JSON.parse(content);

        this.violations.set(violation.violationId, violation);
      }

      logger.info('Violations loaded from disk', {
        count: this.violations.size,
      });
    } catch (error) {
      logger.error('Error loading violations', { error });
    }
  }
}
