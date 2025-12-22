import { MediatorConfig } from '../types';
import { LicenseManager, LicenseProposalParams, LicenseRatificationParams, LicenseRevocationParams } from './LicenseManager';
import { DelegationManager, DelegationProposalParams, DelegationRatificationParams, DelegatedActionParams, DelegationRevocationParams } from './DelegationManager';
import { AuthorityTracker, ViolationParams } from './AuthorityTracker';
import { logger } from '../utils/logger';

/**
 * Main orchestrator for MP-04 Licensing & Delegation Protocol
 * Coordinates LicenseManager, DelegationManager, and AuthorityTracker
 */
export class LicensingManager {
  private config: MediatorConfig;
  private licenseManager: LicenseManager;
  private delegationManager: DelegationManager;
  private authorityTracker: AuthorityTracker;

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/licensing'
  ) {
    this.config = config;

    // Initialize managers
    this.licenseManager = new LicenseManager(
      config,
      `${dataPath}/licenses`
    );

    this.delegationManager = new DelegationManager(
      config,
      `${dataPath}/delegations`
    );

    this.authorityTracker = new AuthorityTracker(
      config,
      `${dataPath}/violations`,
      this.licenseManager,
      this.delegationManager
    );

    logger.info('LicensingManager initialized', {
      dataPath,
    });
  }

  // ============================================================================
  // License Management
  // ============================================================================

  /**
   * Propose a new license
   */
  public proposeLicense(params: LicenseProposalParams) {
    return this.licenseManager.proposeLicense(params);
  }

  /**
   * Ratify a proposed license
   */
  public ratifyLicense(params: LicenseRatificationParams) {
    return this.licenseManager.ratifyLicense(params);
  }

  /**
   * Activate a ratified license
   */
  public activateLicense(licenseId: string) {
    return this.licenseManager.activateLicense(licenseId);
  }

  /**
   * Revoke an active license
   */
  public revokeLicense(params: LicenseRevocationParams) {
    return this.licenseManager.revokeLicense(params);
  }

  /**
   * Check and expire time-bounded licenses
   */
  public checkAndExpireLicenses() {
    return this.licenseManager.checkAndExpireLicenses();
  }

  /**
   * Get license by ID
   */
  public getLicense(licenseId: string) {
    return this.licenseManager.getLicense(licenseId);
  }

  /**
   * Get licenses by grantor
   */
  public getLicensesByGrantor(grantorId: string) {
    return this.licenseManager.getLicensesByGrantor(grantorId);
  }

  /**
   * Get licenses by grantee
   */
  public getLicensesByGrantee(granteeId: string) {
    return this.licenseManager.getLicensesByGrantee(granteeId);
  }

  /**
   * Verify if a grantee has active license for a subject
   */
  public verifyLicense(granteeId: string, subjectType: any, subjectId: string) {
    return this.licenseManager.verifyLicense(granteeId, subjectType, subjectId);
  }

  // ============================================================================
  // Delegation Management
  // ============================================================================

  /**
   * Propose a new delegation
   */
  public proposeDelegation(params: DelegationProposalParams) {
    return this.delegationManager.proposeDelegation(params);
  }

  /**
   * Ratify a proposed delegation
   */
  public ratifyDelegation(params: DelegationRatificationParams) {
    return this.delegationManager.ratifyDelegation(params);
  }

  /**
   * Activate a ratified delegation
   */
  public activateDelegation(delegationId: string) {
    return this.delegationManager.activateDelegation(delegationId);
  }

  /**
   * Record a delegated action
   */
  public recordDelegatedAction(params: DelegatedActionParams) {
    return this.delegationManager.recordDelegatedAction(params);
  }

  /**
   * Revoke an active delegation
   */
  public revokeDelegation(params: DelegationRevocationParams) {
    return this.delegationManager.revokeDelegation(params);
  }

  /**
   * Check and expire time-bounded delegations
   */
  public checkAndExpireDelegations() {
    return this.delegationManager.checkAndExpireDelegations();
  }

  /**
   * Get delegation by ID
   */
  public getDelegation(delegationId: string) {
    return this.delegationManager.getDelegation(delegationId);
  }

  /**
   * Get delegations by delegator
   */
  public getDelegationsByDelegator(delegatorId: string) {
    return this.delegationManager.getDelegationsByDelegator(delegatorId);
  }

  /**
   * Get delegations by delegate
   */
  public getDelegationsByDelegate(delegateId: string) {
    return this.delegationManager.getDelegationsByDelegate(delegateId);
  }

  /**
   * Get actions for a delegation
   */
  public getActionsForDelegation(delegationId: string) {
    return this.delegationManager.getActionsForDelegation(delegationId);
  }

  /**
   * Get out-of-scope actions for a delegation
   */
  public getOutOfScopeActions(delegationId: string) {
    return this.delegationManager.getOutOfScopeActions(delegationId);
  }

  // ============================================================================
  // Authority Tracking & Compliance
  // ============================================================================

  /**
   * Record a scope violation
   */
  public recordViolation(params: ViolationParams) {
    return this.authorityTracker.recordViolation(params);
  }

  /**
   * Check license scope compliance
   */
  public checkLicenseCompliance(params: {
    licenseId: string;
    usageType: string;
    usageDescription: string;
    performedBy: string;
  }) {
    return this.authorityTracker.checkLicenseCompliance(params);
  }

  /**
   * Check delegation scope compliance
   */
  public checkDelegationCompliance(params: {
    delegationId: string;
    actionType: string;
    actionDescription: string;
    performedBy: string;
  }) {
    return this.authorityTracker.checkDelegationCompliance(params);
  }

  /**
   * Link violation to MP-03 dispute
   */
  public linkViolationToDispute(violationId: string, disputeId: string) {
    return this.authorityTracker.linkViolationToDispute(violationId, disputeId);
  }

  /**
   * Get violation by ID
   */
  public getViolation(violationId: string) {
    return this.authorityTracker.getViolation(violationId);
  }

  /**
   * Get violations for a license
   */
  public getViolationsForLicense(licenseId: string) {
    return this.authorityTracker.getViolationsForLicense(licenseId);
  }

  /**
   * Get violations for a delegation
   */
  public getViolationsForDelegation(delegationId: string) {
    return this.authorityTracker.getViolationsForDelegation(delegationId);
  }

  /**
   * Get violations by violator
   */
  public getViolationsByViolator(violatorId: string) {
    return this.authorityTracker.getViolationsByViolator(violatorId);
  }

  // ============================================================================
  // Periodic Maintenance
  // ============================================================================

  /**
   * Check and expire all time-bounded licenses and delegations
   * Should be called periodically (e.g., daily)
   */
  public performExpiryCheck(): {
    expiredLicenses: number;
    expiredDelegations: number;
  } {
    const enableAutoExpire = this.config.autoExpireCheck ?? true;

    if (!enableAutoExpire) {
      return {
        expiredLicenses: 0,
        expiredDelegations: 0,
      };
    }

    const licenseResult = this.licenseManager.checkAndExpireLicenses();
    const delegationResult = this.delegationManager.checkAndExpireDelegations();

    logger.info('Periodic expiry check completed', {
      expiredLicenses: licenseResult.expiredCount,
      expiredDelegations: delegationResult.expiredCount,
    });

    return {
      expiredLicenses: licenseResult.expiredCount,
      expiredDelegations: delegationResult.expiredCount,
    };
  }

  // ============================================================================
  // Manager Access
  // ============================================================================

  /**
   * Get LicenseManager instance (for advanced usage/testing)
   */
  public getLicenseManager(): LicenseManager {
    return this.licenseManager;
  }

  /**
   * Get DelegationManager instance (for advanced usage/testing)
   */
  public getDelegationManager(): DelegationManager {
    return this.delegationManager;
  }

  /**
   * Get AuthorityTracker instance (for advanced usage/testing)
   */
  public getAuthorityTracker(): AuthorityTracker {
    return this.authorityTracker;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get comprehensive statistics
   */
  public getStats(): {
    licenses: ReturnType<LicenseManager['getStats']>;
    delegations: ReturnType<DelegationManager['getStats']>;
    violations: ReturnType<AuthorityTracker['getStats']>;
  } {
    return {
      licenses: this.licenseManager.getStats(),
      delegations: this.delegationManager.getStats(),
      violations: this.authorityTracker.getStats(),
    };
  }
}
