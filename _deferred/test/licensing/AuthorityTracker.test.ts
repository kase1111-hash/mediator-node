import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { MediatorConfig } from '../../src/types';
import {
  AuthorityTracker,
  ViolationParams,
} from '../../src/licensing/AuthorityTracker';
import {
  LicenseManager,
  LicenseProposalParams,
} from '../../src/licensing/LicenseManager';
import {
  DelegationManager,
  DelegationProposalParams,
} from '../../src/licensing/DelegationManager';

describe('AuthorityTracker', () => {
  const testDataPath = './test-data/authority-tracker';
  const licenseDataPath = './test-data/authority-tracker-licenses';
  const delegationDataPath = './test-data/authority-tracker-delegations';
  let config: MediatorConfig;
  let authorityTracker: AuthorityTracker;
  let licenseManager: LicenseManager;
  let delegationManager: DelegationManager;

  beforeEach(() => {
    // Clean up test data
    [testDataPath, licenseDataPath, delegationDataPath].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });

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
      maxDelegationDepth: 2,
      enableViolationTracking: true,
    } as MediatorConfig;

    licenseManager = new LicenseManager(config, licenseDataPath);
    delegationManager = new DelegationManager(config, delegationDataPath);
    authorityTracker = new AuthorityTracker(
      config,
      testDataPath,
      licenseManager,
      delegationManager
    );
  });

  afterEach(() => {
    [testDataPath, licenseDataPath, delegationDataPath].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  describe('Violation Recording', () => {
    it('should record a license violation successfully', () => {
      const params: ViolationParams = {
        type: 'license_scope_violation',
        licenseId: 'license-1',
        violatorId: 'user-1',
        violationDescription: 'Used license for unauthorized commercial purposes',
        evidence: ['invoice-001'],
      };

      const result = authorityTracker.recordViolation(params);

      expect(result.success).toBe(true);
      expect(result.violationId).toBeDefined();

      const violation = authorityTracker.getViolation(result.violationId!);
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('license_scope_violation');
    });

    it('should reject violation without violator ID', () => {
      const result = authorityTracker.recordViolation({
        type: 'purpose_violation',
        licenseId: 'license-1',
        violatorId: '',
        violationDescription: 'Purpose violation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Violator ID is required');
    });
  });

  describe('License Compliance Checking', () => {
    let activeLicenseId: string;

    beforeEach(() => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'artifact',
          ids: ['artifact-1'],
        },
        purpose: 'research and academic study',
        limits: ['no commercial use'],
        duration: {
          type: 'perpetual',
        },
        underlyingReferences: [],
      };

      const proposalResult = licenseManager.proposeLicense(params);
      activeLicenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId: activeLicenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'I grant this license for research purposes',
        humanAuthorship: true,
        signature: 'sig-1',
      });

      licenseManager.activateLicense(activeLicenseId);
    });

    it('should pass compliance check for valid usage', () => {
      const result = authorityTracker.checkLicenseCompliance({
        licenseId: activeLicenseId,
        usageType: 'academic',
        usageDescription: 'Using artifact for research and academic study purposes',
        performedBy: 'grantee-1',
      });

      expect(result.compliant).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('should detect purpose violation', () => {
      const result = authorityTracker.checkLicenseCompliance({
        licenseId: activeLicenseId,
        usageType: 'product_sale',
        usageDescription: 'Selling products based on this artifact',
        performedBy: 'grantee-1',
      });

      expect(result.compliant).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation?.type).toBe('purpose_violation');
    });

    it('should detect limit violation', () => {
      const result = authorityTracker.checkLicenseCompliance({
        licenseId: activeLicenseId,
        usageType: 'research',
        usageDescription: 'Research project with commercial use',
        performedBy: 'grantee-1',
      });

      expect(result.compliant).toBe(false);
      expect(result.violation).toBeDefined();
    });
  });

  describe('Delegation Compliance Checking', () => {
    let activeDelegationId: string;

    beforeEach(() => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiate settlement', 'propose terms'],
        constraints: ['binding agreements'],
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = delegationManager.proposeDelegation(params);
      activeDelegationId = proposalResult.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId: activeDelegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'I delegate these negotiation powers',
        humanAuthorship: true,
        signature: 'sig-1',
      });

      delegationManager.activateDelegation(activeDelegationId);
    });

    it('should pass compliance check for valid action', () => {
      const result = authorityTracker.checkDelegationCompliance({
        delegationId: activeDelegationId,
        actionType: 'action',
        actionDescription: 'Will negotiate settlement and propose terms for resolution',
        performedBy: 'delegate-1',
      });

      expect(result.compliant).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('should detect action outside delegated powers', () => {
      const result = authorityTracker.checkDelegationCompliance({
        delegationId: activeDelegationId,
        actionType: 'approval',
        actionDescription: 'Approving final contract',
        performedBy: 'delegate-1',
      });

      expect(result.compliant).toBe(false);
      expect(result.violation).toBeDefined();
    });

    it('should detect constraint violation', () => {
      const result = authorityTracker.checkDelegationCompliance({
        delegationId: activeDelegationId,
        actionType: 'action',
        actionDescription: 'Will negotiate settlement but create binding agreements',
        performedBy: 'delegate-1',
      });

      expect(result.compliant).toBe(false);
      expect(result.violation).toBeDefined();
    });
  });

  describe('MP-03 Integration', () => {
    it('should link violation to dispute', () => {
      const violationResult = authorityTracker.recordViolation({
        type: 'license_scope_violation',
        licenseId: 'license-1',
        violatorId: 'user-1',
        violationDescription: 'Scope violation detected',
      });

      const linkResult = authorityTracker.linkViolationToDispute(
        violationResult.violationId!,
        'dispute-123'
      );

      expect(linkResult.success).toBe(true);

      const violation = authorityTracker.getViolation(violationResult.violationId!);
      expect(violation?.disputeId).toBe('dispute-123');
    });
  });

  describe('Statistics', () => {
    it('should return comprehensive statistics', () => {
      authorityTracker.recordViolation({
        type: 'license_scope_violation',
        licenseId: 'license-1',
        violatorId: 'user-1',
        violationDescription: 'Violation 1',
      });

      authorityTracker.recordViolation({
        type: 'purpose_violation',
        licenseId: 'license-2',
        violatorId: 'user-1',
        violationDescription: 'Violation 2',
      });

      const stats = authorityTracker.getStats();

      expect(stats.totalViolations).toBe(2);
      expect(stats.violationsByType.license_scope_violation).toBe(1);
      expect(stats.violationsByType.purpose_violation).toBe(1);
      expect(stats.uniqueViolators).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('should persist violations to disk', () => {
      const result = authorityTracker.recordViolation({
        type: 'license_scope_violation',
        licenseId: 'license-1',
        violatorId: 'user-1',
        violationDescription: 'Test violation',
      });

      const filePath = path.join(testDataPath, `${result.violationId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should load violations from disk on initialization', () => {
      const result = authorityTracker.recordViolation({
        type: 'license_scope_violation',
        licenseId: 'license-1',
        violatorId: 'user-1',
        violationDescription: 'Test violation',
      });

      const newTracker = new AuthorityTracker(
        config,
        testDataPath,
        licenseManager,
        delegationManager
      );

      const loaded = newTracker.getViolation(result.violationId!);
      expect(loaded).toBeDefined();
      expect(loaded?.violationDescription).toBe('Test violation');
    });
  });
});
