import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import { MediatorConfig } from '../../src/types';
import { LicensingManager } from '../../src/licensing/LicensingManager';
import { LicenseProposalParams } from '../../src/licensing/LicenseManager';
import { DelegationProposalParams } from '../../src/licensing/DelegationManager';

describe('LicensingManager Integration Tests', () => {
  const testDataPath = './test-data/licensing-manager';
  let config: MediatorConfig;
  let licensingManager: LicensingManager;

  beforeEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true });
    }

    config = {
      chainEndpoint: 'http://localhost:3000',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'openai',
      llmApiKey: 'test-key',
      llmModel: 'gpt-4',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 0.01,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 384,
      maxIntentsCache: 1000,
      acceptanceWindowHours: 24,
      logLevel: 'error',
      requireHumanRatification: true,
      enableLicensingSystem: true,
      maxDelegationDepth: 3,
      autoExpireCheck: true,
      enableViolationTracking: true,
    } as MediatorConfig;

    licensingManager = new LicensingManager(config, testDataPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize all managers successfully', () => {
      expect(licensingManager).toBeDefined();
      expect(licensingManager.getLicenseManager()).toBeDefined();
      expect(licensingManager.getDelegationManager()).toBeDefined();
      expect(licensingManager.getAuthorityTracker()).toBeDefined();
    });
  });

  describe('License Management', () => {
    it('should support full license lifecycle through unified API', () => {
      const proposalParams: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'artifact',
          ids: ['artifact-1'],
        },
        purpose: 'research and development',
        limits: ['no commercial use'],
        duration: {
          type: 'perpetual',
        },
        underlyingReferences: [],
      };

      const proposalResult = licensingManager.proposeLicense(proposalParams);
      expect(proposalResult.success).toBe(true);
      const licenseId = proposalResult.licenseId!;

      const ratificationResult = licensingManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'I grant this license for research purposes',
        humanAuthorship: true,
        signature: 'signature-1',
      });
      expect(ratificationResult.success).toBe(true);

      const activationResult = licensingManager.activateLicense(licenseId);
      expect(activationResult.success).toBe(true);

      const verification = licensingManager.verifyLicense(
        'grantee-1',
        'artifact',
        'artifact-1'
      );
      expect(verification.hasLicense).toBe(true);

      const revocationResult = licensingManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: 'License no longer needed',
        signature: 'signature-rev',
      });
      expect(revocationResult.success).toBe(true);

      const revokedLicense = licensingManager.getLicense(licenseId);
      expect(revokedLicense?.status).toBe('revoked');
    });

    it('should query licenses by grantor', () => {
      licensingManager.proposeLicense({
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: { type: 'artifact', ids: ['artifact-1'] },
        purpose: 'research',
        duration: { type: 'perpetual' },
        underlyingReferences: [],
      });

      licensingManager.proposeLicense({
        grantorId: 'grantor-1',
        granteeId: 'grantee-2',
        proposedBy: 'grantor-1',
        subject: { type: 'artifact', ids: ['artifact-2'] },
        purpose: 'development',
        duration: { type: 'perpetual' },
        underlyingReferences: [],
      });

      const byGrantor = licensingManager.getLicensesByGrantor('grantor-1');
      expect(byGrantor).toHaveLength(2);
      expect(byGrantor.every((l) => l.grantorId === 'grantor-1')).toBe(true);
    });
  });

  describe('Delegation Management', () => {
    it('should support full delegation lifecycle through unified API', () => {
      const proposalParams: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiate', 'propose terms'],
        constraints: ['no binding commitments'],
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licensingManager.proposeDelegation(proposalParams);
      expect(proposalResult.success).toBe(true);
      const delegationId = proposalResult.delegationId!;

      const ratificationResult = licensingManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'I delegate these negotiation powers',
        humanAuthorship: true,
        signature: 'signature-1',
      });
      expect(ratificationResult.success).toBe(true);

      const activationResult = licensingManager.activateDelegation(delegationId);
      expect(activationResult.success).toBe(true);

      const actionResult = licensingManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'action',
        actionDescription: 'Will negotiate and propose terms for settlement',
        referencedGrant: delegationId,
      });
      expect(actionResult.success).toBe(true);
      expect(actionResult.withinScope).toBe(true);

      const revocationResult = licensingManager.revokeDelegation({
        delegationId,
        revokedBy: 'delegator-1',
        revocationStatement: 'Delegation no longer needed',
        signature: 'signature-rev',
      });
      expect(revocationResult.success).toBe(true);

      const revokedDelegation = licensingManager.getDelegation(delegationId);
      expect(revokedDelegation?.status).toBe('revoked');
    });
  });

  describe('Authority Tracking', () => {
    it('should check license compliance', () => {
      const proposalResult = licensingManager.proposeLicense({
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: { type: 'artifact', ids: ['artifact-1'] },
        purpose: 'research and development',
        limits: ['no commercial use'],
        duration: { type: 'perpetual' },
        underlyingReferences: [],
      });
      const licenseId = proposalResult.licenseId!;

      licensingManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'License granted',
        humanAuthorship: true,
        signature: 'sig',
      });

      licensingManager.activateLicense(licenseId);

      const compliantResult = licensingManager.checkLicenseCompliance({
        licenseId,
        usageType: 'research',
        usageDescription: 'Using for research and development purposes',
        performedBy: 'grantee-1',
      });
      expect(compliantResult.compliant).toBe(true);

      const nonCompliantResult = licensingManager.checkLicenseCompliance({
        licenseId,
        usageType: 'commercial',
        usageDescription: 'Commercial use for profit',
        performedBy: 'grantee-1',
      });
      expect(nonCompliantResult.compliant).toBe(false);
      expect(nonCompliantResult.violation).toBeDefined();
    });

    it('should check delegation compliance', () => {
      const proposalResult = licensingManager.proposeDelegation({
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiate settlement'],
        constraints: ['binding agreements'],
        duration: { type: 'perpetual' },
      });
      const delegationId = proposalResult.delegationId!;

      licensingManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Delegation granted',
        humanAuthorship: true,
        signature: 'sig',
      });

      licensingManager.activateDelegation(delegationId);

      const compliantResult = licensingManager.checkDelegationCompliance({
        delegationId,
        actionType: 'action',
        actionDescription: 'Will negotiate settlement with the parties',
        performedBy: 'delegate-1',
      });
      expect(compliantResult.compliant).toBe(true);

      const nonCompliantResult = licensingManager.checkDelegationCompliance({
        delegationId,
        actionType: 'action',
        actionDescription: 'Will negotiate settlement but create binding agreements',
        performedBy: 'delegate-1',
      });
      expect(nonCompliantResult.compliant).toBe(false);
      expect(nonCompliantResult.violation).toBeDefined();
    });
  });

  describe('Periodic Maintenance', () => {
    it('should check and expire licenses and delegations', () => {
      // Create expiring license
      const licenseResult = licensingManager.proposeLicense({
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: { type: 'artifact', ids: ['artifact-1'] },
        purpose: 'temporary use',
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 50,
        },
        underlyingReferences: [],
      });
      const licenseId = licenseResult.licenseId!;

      licensingManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Temporary license',
        humanAuthorship: true,
        signature: 'sig',
      });

      licensingManager.activateLicense(licenseId);

      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Busy wait
      }

      // Perform expiry check
      const expiryResult = licensingManager.performExpiryCheck();

      expect(expiryResult.expiredLicenses).toBe(1);

      const license = licensingManager.getLicense(licenseId);
      expect(license?.status).toBe('expired');
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive statistics', () => {
      const license1 = licensingManager.proposeLicense({
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: { type: 'artifact', ids: ['artifact-1'] },
        purpose: 'research',
        duration: { type: 'perpetual' },
        underlyingReferences: [],
      });

      licensingManager.ratifyLicense({
        licenseId: license1.licenseId!,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'License granted',
        humanAuthorship: true,
        signature: 'sig',
      });

      licensingManager.activateLicense(license1.licenseId!);

      const stats = licensingManager.getStats();

      expect(stats.licenses).toBeDefined();
      expect(stats.licenses.totalLicenses).toBe(1);
      expect(stats.licenses.activeLicenses).toBe(1);

      expect(stats.delegations).toBeDefined();
      expect(stats.violations).toBeDefined();
    });
  });
});
