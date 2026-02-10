import { MediatorConfig, DisputeDeclaration, DisputeStatus } from '../types';
import { EffortCaptureSystem } from '../effort/EffortCaptureSystem';
import { DisputeManager } from '../dispute/DisputeManager';
import { LicensingManager } from '../licensing/LicensingManager';
import { logger } from '../utils/logger';

/**
 * Validates MP-05 settlement preconditions
 * Checks against MP-01 (agreements), MP-02 (receipts), MP-03 (disputes), MP-04 (licenses)
 */
export class MP05SettlementValidator {
  private config: MediatorConfig;
  private effortCaptureSystem?: EffortCaptureSystem;
  private disputeManager?: DisputeManager;
  private licensingManager?: LicensingManager;

  constructor(
    config: MediatorConfig,
    effortCaptureSystem?: EffortCaptureSystem,
    disputeManager?: DisputeManager,
    licensingManager?: LicensingManager
  ) {
    this.config = config;
    this.effortCaptureSystem = effortCaptureSystem;
    this.disputeManager = disputeManager;
    this.licensingManager = licensingManager;
  }

  /**
   * Validate all preconditions for settlement declaration
   */
  public validatePreconditions(params: {
    referencedAgreements: string[];
    referencedReceipts: string[];
    referencedLicenses?: string[];
    referencedDelegations?: string[];
    declaringPartyId: string;
  }): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Skip validation if auto-validate is disabled
    if (this.config.autoValidatePreconditions === false) {
      return { valid: true, errors, warnings };
    }

    // Validate MP-02: Effort receipts
    if (params.referencedReceipts.length > 0) {
      const receiptValidation = this.validateReceipts(params.referencedReceipts);
      errors.push(...receiptValidation.errors);
      warnings.push(...receiptValidation.warnings);
    }

    // Validate MP-03: No active disputes
    const disputeValidation = this.validateNoActiveDisputes(
      params.referencedAgreements,
      params.referencedReceipts
    );
    errors.push(...disputeValidation.errors);
    warnings.push(...disputeValidation.warnings);

    // Validate MP-04: Licenses and delegations
    if (params.referencedLicenses && params.referencedLicenses.length > 0) {
      const licenseValidation = this.validateLicenses(params.referencedLicenses);
      errors.push(...licenseValidation.errors);
      warnings.push(...licenseValidation.warnings);
    }

    if (params.referencedDelegations && params.referencedDelegations.length > 0) {
      const delegationValidation = this.validateDelegations(params.referencedDelegations);
      errors.push(...delegationValidation.errors);
      warnings.push(...delegationValidation.warnings);
    }

    const valid = errors.length === 0;

    if (!valid) {
      logger.warn('Settlement precondition validation failed', {
        errors,
        warnings,
        declaringParty: params.declaringPartyId,
      });
    }

    return { valid, errors, warnings };
  }

  /**
   * Validate that referenced receipts exist and are anchored (MP-02)
   */
  private validateReceipts(receiptIds: string[]): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.effortCaptureSystem) {
      warnings.push('Effort Capture System not available - cannot validate receipts');
      return { errors, warnings };
    }

    for (const receiptId of receiptIds) {
      const receipt = this.effortCaptureSystem.getReceipt(receiptId);

      if (!receipt) {
        errors.push(`Receipt ${receiptId} not found`);
        continue;
      }

      // Check if receipt is anchored
      if (receipt.status !== 'anchored' && receipt.status !== 'verified') {
        warnings.push(
          `Receipt ${receiptId} is not fully validated (status: ${receipt.status})`
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate that no active disputes exist for referenced artifacts (MP-03)
   */
  private validateNoActiveDisputes(
    agreementIds: string[],
    receiptIds: string[]
  ): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.disputeManager) {
      warnings.push('Dispute Manager not available - cannot validate disputes');
      return { errors, warnings };
    }

    // Get all active disputes
    const activeStatuses: DisputeStatus[] = ['initiated', 'under_review', 'clarifying', 'escalated'];
    const allDisputes: DisputeDeclaration[] = [];

    // Collect disputes from all active statuses
    for (const status of activeStatuses) {
      allDisputes.push(...this.disputeManager.getDisputesByStatus(status));
    }

    // Check for active disputes on agreements
    for (const agreementId of agreementIds) {
      const disputes = allDisputes.filter((d: DisputeDeclaration) =>
        d.contestedItems.some((item) => item.itemType === 'agreement' && item.itemId === agreementId)
      );

      if (disputes.length > 0) {
        errors.push(
          `Agreement ${agreementId} has ${disputes.length} active dispute(s)`
        );
      }
    }

    // Check for active disputes on receipts
    for (const receiptId of receiptIds) {
      const disputes = allDisputes.filter((d: DisputeDeclaration) =>
        d.contestedItems.some((item) => item.itemType === 'receipt' && item.itemId === receiptId)
      );

      if (disputes.length > 0) {
        errors.push(
          `Receipt ${receiptId} has ${disputes.length} active dispute(s)`
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate that referenced licenses are active (MP-04)
   */
  private validateLicenses(licenseIds: string[]): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.licensingManager) {
      warnings.push('Licensing Manager not available - cannot validate licenses');
      return { errors, warnings };
    }

    for (const licenseId of licenseIds) {
      const license = this.licensingManager.getLicense(licenseId);

      if (!license) {
        errors.push(`License ${licenseId} not found`);
        continue;
      }

      if (license.status !== 'active') {
        errors.push(
          `License ${licenseId} is not active (status: ${license.status})`
        );
      }

      // Check if license is expired
      if (
        license.scope.duration.type === 'time_bounded' &&
        license.scope.duration.expiresAt &&
        license.scope.duration.expiresAt < Date.now()
      ) {
        errors.push(`License ${licenseId} has expired`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate that referenced delegations are active (MP-04)
   */
  private validateDelegations(delegationIds: string[]): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.licensingManager) {
      warnings.push('Licensing Manager not available - cannot validate delegations');
      return { errors, warnings };
    }

    for (const delegationId of delegationIds) {
      const delegation = this.licensingManager.getDelegation(delegationId);

      if (!delegation) {
        errors.push(`Delegation ${delegationId} not found`);
        continue;
      }

      if (delegation.status !== 'active') {
        errors.push(
          `Delegation ${delegationId} is not active (status: ${delegation.status})`
        );
      }

      // Check if delegation is expired
      if (
        delegation.scope.duration.type === 'time_bounded' &&
        delegation.scope.duration.expiresAt &&
        delegation.scope.duration.expiresAt < Date.now()
      ) {
        errors.push(`Delegation ${delegationId} has expired`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Check if a party is authorized to declare settlement
   */
  public validatePartyAuthorization(
    partyId: string,
    requiredParties: string[]
  ): boolean {
    return requiredParties.includes(partyId);
  }

  /**
   * Validate settlement stage completion
   */
  public validateStageCompletion(
    stageNumber: number,
    completedStages: number[]
  ): {
    valid: boolean;
    error?: string;
  } {
    // Check if previous stages are completed
    for (let i = 1; i < stageNumber; i++) {
      if (!completedStages.includes(i)) {
        return {
          valid: false,
          error: `Stage ${i} must be completed before stage ${stageNumber}`,
        };
      }
    }

    // Check if this stage is already completed
    if (completedStages.includes(stageNumber)) {
      return {
        valid: false,
        error: `Stage ${stageNumber} is already completed`,
      };
    }

    return { valid: true };
  }
}
