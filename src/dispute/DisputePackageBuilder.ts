import {
  MediatorConfig,
  DisputePackage,
  DisputeDeclaration,
  DisputeEvidence,
  DisputeTimelineEntry,
  Intent,
  ProposedSettlement,
  EffortReceipt,
  ClarificationRecord,
} from '../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Package build options
 */
export interface PackageBuildOptions {
  includeIntents?: boolean;
  includeSettlements?: boolean;
  includeReceipts?: boolean;
  includeEvidence?: boolean;
  includeClarifications?: boolean;
  includeEscalations?: boolean;
  specificEscalationId?: string; // Build package for specific escalation
}

/**
 * Package verification result
 */
export interface PackageVerificationResult {
  isValid: boolean;
  hashMatches: boolean;
  isComplete: boolean;
  missingComponents: string[];
  errors: string[];
}

/**
 * Manages dispute package assembly and export
 * Packages all dispute-related data into a comprehensive, verifiable bundle
 */
export class DisputePackageBuilder {
  private config: MediatorConfig;
  private packages: Map<string, DisputePackage> = new Map();
  private dataPath: string;

  constructor(config: MediatorConfig, dataPath: string = './data/packages') {
    this.config = config;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing packages
    this.loadPackages();

    logger.info('DisputePackageBuilder initialized', {
      dataPath,
      packagesLoaded: this.packages.size,
    });
  }

  /**
   * Build a dispute package
   */
  public async buildPackage(params: {
    dispute: DisputeDeclaration;
    timeline: DisputeTimelineEntry[];
    evidence: DisputeEvidence[];
    clarifications?: ClarificationRecord[];
    intents?: Intent[];
    settlements?: ProposedSettlement[];
    receipts?: EffortReceipt[];
    createdBy: string;
    options?: PackageBuildOptions;
  }): Promise<{
    success: boolean;
    packageId?: string;
    error?: string;
  }> {
    try {
      const {
        dispute,
        timeline,
        evidence,
        clarifications = [],
        intents = [],
        settlements = [],
        receipts = [],
        createdBy,
        options = {},
      } = params;

      // Apply options filtering
      const filteredIntents = options.includeIntents !== false ? intents : [];
      const filteredSettlements =
        options.includeSettlements !== false ? settlements : [];
      const filteredReceipts = options.includeReceipts !== false ? receipts : [];
      const filteredEvidence =
        options.includeEvidence !== false ? evidence : [];
      const filteredClarifications =
        options.includeClarifications !== false ? clarifications : [];

      const packageId = nanoid();
      const now = Date.now();

      // Generate summary
      const summary = this.generateSummary(dispute, {
        intentCount: filteredIntents.length,
        settlementCount: filteredSettlements.length,
        receiptCount: filteredReceipts.length,
        evidenceCount: filteredEvidence.length,
        clarificationCount: filteredClarifications.length,
        escalated: dispute.status === 'escalated',
      });

      // Create package structure
      const packageData: DisputePackage = {
        packageId,
        disputeId: dispute.disputeId,
        createdAt: now,
        createdBy,
        summary,
        timeline,
        bundledRecords: {
          intents: filteredIntents,
          settlements: filteredSettlements,
          receipts: filteredReceipts,
          evidence: filteredEvidence,
          clarifications: filteredClarifications,
        },
        packageHash: '', // Will be calculated below
        completenessVerified: false,
      };

      // Calculate package hash
      packageData.packageHash = this.calculatePackageHash(packageData);

      // Verify completeness
      const verification = this.verifyPackage(packageData, dispute);
      packageData.completenessVerified = verification.isComplete;

      // Store package
      this.packages.set(packageId, packageData);
      this.savePackage(packageData);

      logger.info('Dispute package created', {
        packageId,
        disputeId: dispute.disputeId,
        complete: packageData.completenessVerified,
        recordCount:
          filteredIntents.length +
          filteredSettlements.length +
          filteredReceipts.length +
          filteredEvidence.length +
          filteredClarifications.length,
      });

      return {
        success: true,
        packageId,
      };
    } catch (error) {
      logger.error('Error building dispute package', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Generate human-readable summary of the package
   */
  private generateSummary(
    dispute: DisputeDeclaration,
    stats: {
      intentCount: number;
      settlementCount: number;
      receiptCount: number;
      evidenceCount: number;
      clarificationCount: number;
      escalated: boolean;
    }
  ): string {
    const lines: string[] = [];

    lines.push('[DISPUTE PACKAGE SUMMARY]');
    lines.push('');
    lines.push(`Dispute ID: ${dispute.disputeId}`);
    lines.push(`Status: ${dispute.status}`);
    lines.push('');

    lines.push('**Parties:**');
    lines.push(
      `Claimant: ${dispute.claimant.partyId}${dispute.claimant.name ? ` (${dispute.claimant.name})` : ''}`
    );
    if (dispute.respondent) {
      lines.push(
        `Respondent: ${dispute.respondent.partyId}${dispute.respondent.name ? ` (${dispute.respondent.name})` : ''}`
      );
    } else {
      lines.push('Respondent: To be determined');
    }
    lines.push('');

    lines.push('**Issue:**');
    lines.push(dispute.issueDescription);
    lines.push('');

    lines.push('**Contested Items:**');
    for (const item of dispute.contestedItems) {
      lines.push(`- ${item.itemType}: ${item.itemId}`);
    }
    lines.push('');

    lines.push('**Package Contents:**');
    if (stats.intentCount > 0) {
      lines.push(`- Intents: ${stats.intentCount}`);
    }
    if (stats.settlementCount > 0) {
      lines.push(`- Settlements: ${stats.settlementCount}`);
    }
    if (stats.receiptCount > 0) {
      lines.push(`- Effort Receipts: ${stats.receiptCount}`);
    }
    if (stats.evidenceCount > 0) {
      lines.push(`- Evidence Items: ${stats.evidenceCount}`);
    }
    if (stats.clarificationCount > 0) {
      lines.push(`- Clarification Records: ${stats.clarificationCount}`);
    }
    lines.push('');

    if (stats.escalated && dispute.escalation) {
      lines.push('**Escalation:**');
      lines.push(`Authority: ${dispute.escalation.targetAuthority.name}`);
      lines.push(
        `Escalated by: ${dispute.escalation.escalatedBy} at ${new Date(dispute.escalation.escalatedAt).toISOString()}`
      );
      lines.push('Scope of Issues:');
      for (const issue of dispute.escalation.scopeOfIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    lines.push('**Timeline:**');
    lines.push(`Initiated: ${new Date(dispute.initiatedAt).toISOString()}`);
    if (dispute.resolution) {
      lines.push(
        `Resolved: ${new Date(dispute.resolution.resolvedAt).toISOString()}`
      );
      lines.push(`Outcome: ${dispute.resolution.outcome}`);
    }
    lines.push('');

    lines.push(
      'This package contains a complete, verifiable record of the dispute for external review and adjudication.'
    );

    return lines.join('\n');
  }

  /**
   * Calculate cryptographic hash of package contents
   */
  private calculatePackageHash(packageData: DisputePackage): string {
    // Create a canonical representation for hashing
    const canonical = {
      disputeId: packageData.disputeId,
      createdAt: packageData.createdAt,
      summary: packageData.summary,
      timeline: packageData.timeline,
      bundledRecords: packageData.bundledRecords,
    };

    const jsonString = JSON.stringify(canonical, null, 0);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }

  /**
   * Verify package integrity and completeness
   */
  public verifyPackage(
    packageData: DisputePackage,
    dispute?: DisputeDeclaration
  ): PackageVerificationResult {
    const errors: string[] = [];
    const missingComponents: string[] = [];

    // Verify hash
    const calculatedHash = this.calculatePackageHash(packageData);
    const hashMatches = calculatedHash === packageData.packageHash;

    if (!hashMatches) {
      errors.push('Package hash does not match calculated hash');
    }

    // Check for required components
    if (!packageData.timeline || packageData.timeline.length === 0) {
      missingComponents.push('timeline');
    }

    if (!packageData.summary || packageData.summary.length === 0) {
      missingComponents.push('summary');
    }

    // If dispute is provided, do more thorough verification
    if (dispute) {
      // Verify disputed items are documented in evidence
      const contestedItemIds = dispute.contestedItems.map((item) => item.itemId);
      const evidencedItems = new Set(
        packageData.bundledRecords.evidence.flatMap(
          (e) => e.linkedItems || []
        )
      );

      const undocumentedItems = contestedItemIds.filter(
        (id) => !evidencedItems.has(id)
      );

      if (undocumentedItems.length > 0) {
        missingComponents.push(
          `evidence for items: ${undocumentedItems.join(', ')}`
        );
      }

      // Verify clarification if dispute was in clarifying status
      if (
        (dispute.status === 'clarifying' || dispute.status === 'escalated') &&
        packageData.bundledRecords.clarifications.length === 0
      ) {
        missingComponents.push('clarification records');
      }
    }

    const isComplete = missingComponents.length === 0;

    return {
      isValid: hashMatches && errors.length === 0,
      hashMatches,
      isComplete,
      missingComponents,
      errors,
    };
  }

  /**
   * Export package to JSON file
   */
  public exportToJSON(packageId: string): {
    success: boolean;
    filePath?: string;
    error?: string;
  } {
    try {
      const packageData = this.packages.get(packageId);

      if (!packageData) {
        return {
          success: false,
          error: 'Package not found',
        };
      }

      const exportPath = path.join(
        this.dataPath,
        'exports',
        `${packageId}.json`
      );

      // Ensure export directory exists
      const exportDir = path.dirname(exportPath);
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      // Write formatted JSON
      fs.writeFileSync(exportPath, JSON.stringify(packageData, null, 2));

      // Update package with export path
      if (!packageData.exportFormats) {
        packageData.exportFormats = {};
      }
      packageData.exportFormats.json = exportPath;
      this.savePackage(packageData);

      logger.info('Package exported to JSON', { packageId, exportPath });

      return {
        success: true,
        filePath: exportPath,
      };
    } catch (error) {
      logger.error('Error exporting package to JSON', { packageId, error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Export package to formatted text
   */
  public exportToText(packageId: string): {
    success: boolean;
    filePath?: string;
    error?: string;
  } {
    try {
      const packageData = this.packages.get(packageId);

      if (!packageData) {
        return {
          success: false,
          error: 'Package not found',
        };
      }

      const exportPath = path.join(
        this.dataPath,
        'exports',
        `${packageId}.txt`
      );

      // Ensure export directory exists
      const exportDir = path.dirname(exportPath);
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      // Generate formatted text
      const lines: string[] = [];

      lines.push('=' .repeat(80));
      lines.push('DISPUTE PACKAGE');
      lines.push('='.repeat(80));
      lines.push('');
      lines.push(`Package ID: ${packageData.packageId}`);
      lines.push(`Dispute ID: ${packageData.disputeId}`);
      lines.push(
        `Created: ${new Date(packageData.createdAt).toISOString()} by ${packageData.createdBy}`
      );
      lines.push(`Package Hash: ${packageData.packageHash}`);
      lines.push(
        `Completeness Verified: ${packageData.completenessVerified ? 'Yes' : 'No'}`
      );
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('SUMMARY');
      lines.push('-'.repeat(80));
      lines.push('');
      lines.push(packageData.summary);
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('TIMELINE');
      lines.push('-'.repeat(80));
      lines.push('');

      for (const entry of packageData.timeline) {
        lines.push(
          `[${new Date(entry.timestamp).toISOString()}] ${entry.eventType.toUpperCase()}`
        );
        lines.push(`  Actor: ${entry.actor}`);
        lines.push(`  Description: ${entry.description}`);
        if (entry.referenceId) {
          lines.push(`  Reference: ${entry.referenceId}`);
        }
        lines.push('');
      }

      lines.push('-'.repeat(80));
      lines.push('EVIDENCE');
      lines.push('-'.repeat(80));
      lines.push('');

      if (packageData.bundledRecords.evidence.length === 0) {
        lines.push('No evidence items included in this package.');
      } else {
        for (const evidence of packageData.bundledRecords.evidence) {
          lines.push(`Evidence ID: ${evidence.evidenceId}`);
          lines.push(`  Type: ${evidence.evidenceType}`);
          lines.push(`  Submitted by: ${evidence.submittedBy}`);
          lines.push(
            `  Timestamp: ${new Date(evidence.timestamp).toISOString()}`
          );
          lines.push(`  Description: ${evidence.description}`);
          if (evidence.contentHash) {
            lines.push(`  Content Hash: ${evidence.contentHash}`);
          }
          if (evidence.linkedItems && evidence.linkedItems.length > 0) {
            lines.push(`  Linked Items: ${evidence.linkedItems.join(', ')}`);
          }
          lines.push('');
        }
      }

      lines.push('-'.repeat(80));
      lines.push('CLARIFICATIONS');
      lines.push('-'.repeat(80));
      lines.push('');

      if (packageData.bundledRecords.clarifications.length === 0) {
        lines.push('No clarification records included in this package.');
      } else {
        for (const clarification of packageData.bundledRecords.clarifications) {
          lines.push(`Clarification ID: ${clarification.clarificationId}`);
          lines.push(`  Mediator: ${clarification.mediatorId}`);
          lines.push(
            `  Started: ${new Date(clarification.startedAt).toISOString()}`
          );
          if (clarification.completedAt) {
            lines.push(
              `  Completed: ${new Date(clarification.completedAt).toISOString()}`
            );
          }
          if (clarification.claimantStatements.length > 0) {
            lines.push('  Claimant Statements:');
            for (const stmt of clarification.claimantStatements) {
              lines.push(`    - ${stmt}`);
            }
          }
          if (clarification.respondentStatements.length > 0) {
            lines.push('  Respondent Statements:');
            for (const stmt of clarification.respondentStatements) {
              lines.push(`    - ${stmt}`);
            }
          }
          if (clarification.factualDisagreements.length > 0) {
            lines.push('  Factual Disagreements:');
            for (const fact of clarification.factualDisagreements) {
              lines.push(`    - ${fact}`);
            }
          }
          if (clarification.interpretiveDisagreements.length > 0) {
            lines.push('  Interpretive Disagreements:');
            for (const interp of clarification.interpretiveDisagreements) {
              lines.push(`    - ${interp}`);
            }
          }
          if (clarification.scopeNarrowing) {
            lines.push(`  Scope Narrowing: ${clarification.scopeNarrowing}`);
          }
          lines.push('');
        }
      }

      lines.push('='.repeat(80));
      lines.push('END OF PACKAGE');
      lines.push('='.repeat(80));

      fs.writeFileSync(exportPath, lines.join('\n'));

      logger.info('Package exported to text', { packageId, exportPath });

      return {
        success: true,
        filePath: exportPath,
      };
    } catch (error) {
      logger.error('Error exporting package to text', { packageId, error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get package by ID
   */
  public getPackage(packageId: string): DisputePackage | undefined {
    return this.packages.get(packageId);
  }

  /**
   * Get all packages for a dispute
   */
  public getPackagesForDispute(disputeId: string): DisputePackage[] {
    return Array.from(this.packages.values()).filter(
      (pkg) => pkg.disputeId === disputeId
    );
  }

  /**
   * Get all packages
   */
  public getAllPackages(): DisputePackage[] {
    return Array.from(this.packages.values());
  }

  /**
   * Delete package
   */
  public deletePackage(packageId: string): boolean {
    const packageData = this.packages.get(packageId);

    if (!packageData) {
      return false;
    }

    // Delete from memory
    this.packages.delete(packageId);

    // Delete from disk
    const filePath = path.join(this.dataPath, `${packageId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete exports if they exist
    if (packageData.exportFormats) {
      if (packageData.exportFormats.json && fs.existsSync(packageData.exportFormats.json)) {
        fs.unlinkSync(packageData.exportFormats.json);
      }
    }

    logger.info('Package deleted', { packageId });

    return true;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalPackages: number;
    verifiedPackages: number;
    packagesByDispute: Record<string, number>;
    averagePackageSize: number;
  } {
    const packagesByDispute: Record<string, number> = {};
    let verifiedCount = 0;
    let totalSize = 0;

    for (const pkg of this.packages.values()) {
      if (pkg.completenessVerified) {
        verifiedCount++;
      }

      packagesByDispute[pkg.disputeId] =
        (packagesByDispute[pkg.disputeId] || 0) + 1;

      // Calculate package size (total records)
      const size =
        pkg.bundledRecords.intents.length +
        pkg.bundledRecords.settlements.length +
        pkg.bundledRecords.receipts.length +
        pkg.bundledRecords.evidence.length +
        pkg.bundledRecords.clarifications.length;
      totalSize += size;
    }

    return {
      totalPackages: this.packages.size,
      verifiedPackages: verifiedCount,
      packagesByDispute,
      averagePackageSize:
        this.packages.size > 0
          ? Math.round((totalSize / this.packages.size) * 10) / 10
          : 0,
    };
  }

  /**
   * Save package to disk
   */
  private savePackage(packageData: DisputePackage): void {
    const filePath = path.join(this.dataPath, `${packageData.packageId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(packageData, null, 2));
    } catch (error) {
      logger.error('Error saving package', {
        packageId: packageData.packageId,
        error,
      });
    }
  }

  /**
   * Load all packages from disk
   */
  private loadPackages(): void {
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
        const packageData: DisputePackage = JSON.parse(content);

        this.packages.set(packageData.packageId, packageData);
      }

      logger.info('Packages loaded from disk', {
        count: this.packages.size,
      });
    } catch (error) {
      logger.error('Error loading packages', { error });
    }
  }
}
