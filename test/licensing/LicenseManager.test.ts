import { LicenseManager, LicenseProposalParams } from '../../src/licensing/LicenseManager';
import { MediatorConfig, SubjectType } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('LicenseManager', () => {
  let licenseManager: LicenseManager;
  let config: MediatorConfig;
  const testDataPath = './test-data/licenses';

  beforeEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
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
    } as MediatorConfig;

    licenseManager = new LicenseManager(config, testDataPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  describe('License Proposal', () => {
    it('should propose a license successfully', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1', 'receipt-2'],
        },
        purpose: 'research and academic use',
        limits: ['commercial use', 'redistribution'],
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        },
        transferability: {
          sublicenseAllowed: false,
          redelegationAllowed: false,
        },
        underlyingReferences: ['hash-1', 'hash-2'],
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(true);
      expect(result.licenseId).toBeDefined();

      const license = licenseManager.getLicense(result.licenseId!);
      expect(license).toBeDefined();
      expect(license?.status).toBe('proposed');
      expect(license?.grantorId).toBe('grantor-1');
      expect(license?.granteeId).toBe('grantee-1');
      expect(license?.scope.subject.ids).toHaveLength(2);
      expect(license?.scope.purpose).toBe('research and academic use');
      expect(license?.scope.limits).toHaveLength(2);
    });

    it('should reject proposal without grantor', () => {
      const params: LicenseProposalParams = {
        grantorId: '',
        granteeId: 'grantee-1',
        proposedBy: 'proposer-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Grantor and grantee are required');
    });

    it('should reject proposal without subject IDs', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: [],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Subject with at least one ID is required');
    });

    it('should reject time-bounded license without expiration', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'time_bounded',
        },
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expiration time required');
    });

    it('should reject time-bounded license with past expiration', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() - 1000,
        },
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expiration time must be in the future');
    });

    it('should allow mediator to propose license', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'mediator-1', // Different from grantor
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'research',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);

      expect(result.success).toBe(true);
      const license = licenseManager.getLicense(result.licenseId!);
      expect(license?.proposedBy).toBe('mediator-1');
    });
  });

  describe('License Ratification', () => {
    let licenseId: string;

    beforeEach(() => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'research',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);
      licenseId = result.licenseId!;
    });

    it('should ratify license successfully', () => {
      const result = licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'I hereby grant this license for research purposes',
        humanAuthorship: true,
        signature: 'signature-1',
      });

      expect(result.success).toBe(true);

      const license = licenseManager.getLicense(licenseId);
      expect(license?.status).toBe('ratified');
      expect(license?.ratifiedAt).toBeDefined();
      expect(license?.ratificationStatement).toBe('I hereby grant this license for research purposes');
      expect(license?.humanAuthorship).toBe(true);
      expect(license?.licenseHash).toBeDefined();
      expect(license?.licenseHash.length).toBe(64); // SHA-256 hash
    });

    it('should reject ratification by non-grantor', () => {
      const result = licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'other-user',
        ratificationStatement: 'Invalid ratification',
        humanAuthorship: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only the grantor can ratify');
    });

    it('should reject ratification without human authorship', () => {
      const result = licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Human authorship required');
    });

    it('should reject ratification without statement', () => {
      const result = licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: '',
        humanAuthorship: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ratification statement is required');
    });

    it('should reject ratification of non-existent license', () => {
      const result = licenseManager.ratifyLicense({
        licenseId: 'non-existent',
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('License not found');
    });
  });

  describe('License Activation', () => {
    let licenseId: string;

    beforeEach(() => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'research',
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      licenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'I grant this license',
        humanAuthorship: true,
      });
    });

    it('should activate ratified license successfully', () => {
      const result = licenseManager.activateLicense(licenseId);

      expect(result.success).toBe(true);

      const license = licenseManager.getLicense(licenseId);
      expect(license?.status).toBe('active');
      expect(license?.activatedAt).toBeDefined();
    });

    it('should reject activation of non-ratified license', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      const result = licenseManager.activateLicense(proposalResult.licenseId!);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be activated from proposed status');
    });

    it('should reject activation of expired license', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 50, // Expires very soon
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      const expiredLicenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId: expiredLicenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      // Wait for expiry
      const waitTime = 100;
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // Busy wait
      }

      const result = licenseManager.activateLicense(expiredLicenseId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already expired');
    });
  });

  describe('License Revocation', () => {
    let licenseId: string;

    beforeEach(() => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'research',
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      licenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'I grant this license',
        humanAuthorship: true,
      });

      licenseManager.activateLicense(licenseId);
    });

    it('should revoke active license successfully', () => {
      const result = licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: 'License revoked due to misuse',
        signature: 'sig-1',
      });

      expect(result.success).toBe(true);

      const license = licenseManager.getLicense(licenseId);
      expect(license?.status).toBe('revoked');
      expect(license?.revokedAt).toBeDefined();
      expect(license?.revocationStatement).toBe('License revoked due to misuse');
      expect(license?.revocationSignature).toBe('sig-1');
    });

    it('should reject revocation by non-grantor', () => {
      const result = licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'other-user',
        revocationStatement: 'Invalid revocation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only the grantor can revoke');
    });

    it('should reject revocation without statement', () => {
      const result = licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Revocation statement is required');
    });

    it('should reject revocation of already revoked license', () => {
      licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: 'First revocation',
      });

      const result = licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: 'Second revocation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already revoked');
    });
  });

  describe('License Expiry', () => {
    it('should automatically expire time-bounded licenses', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 100, // Expires in 100ms
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      const licenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      licenseManager.activateLicense(licenseId);

      // Wait for expiry
      const waitTime = 200;
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // Busy wait
      }

      const result = licenseManager.checkAndExpireLicenses();

      expect(result.expiredCount).toBe(1);
      expect(result.expiredLicenses).toContain(licenseId);

      const license = licenseManager.getLicense(licenseId);
      expect(license?.status).toBe('expired');
    });

    it('should not expire perpetual licenses', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      const licenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      licenseManager.activateLicense(licenseId);

      const result = licenseManager.checkAndExpireLicenses();

      expect(result.expiredCount).toBe(0);

      const license = licenseManager.getLicense(licenseId);
      expect(license?.status).toBe('active');
    });
  });

  describe('License Verification', () => {
    let licenseId: string;

    beforeEach(() => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1', 'receipt-2'],
        },
        purpose: 'research',
        duration: {
          type: 'perpetual',
        },
      };

      const proposalResult = licenseManager.proposeLicense(params);
      licenseId = proposalResult.licenseId!;

      licenseManager.ratifyLicense({
        licenseId,
        ratifiedBy: 'grantor-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      licenseManager.activateLicense(licenseId);
    });

    it('should verify active license', () => {
      const result = licenseManager.verifyLicense('grantee-1', 'receipt', 'receipt-1');

      expect(result.hasLicense).toBe(true);
      expect(result.license?.licenseId).toBe(licenseId);
    });

    it('should reject verification for different grantee', () => {
      const result = licenseManager.verifyLicense('other-user', 'receipt', 'receipt-1');

      expect(result.hasLicense).toBe(false);
      expect(result.reason).toBe('No license found');
    });

    it('should reject verification for different subject', () => {
      const result = licenseManager.verifyLicense('grantee-1', 'receipt', 'receipt-999');

      expect(result.hasLicense).toBe(false);
      expect(result.reason).toBe('No license found');
    });

    it('should detect expired license', () => {
      licenseManager.revokeLicense({
        licenseId,
        revokedBy: 'grantor-1',
        revocationStatement: 'Test revocation',
      });

      const result = licenseManager.verifyLicense('grantee-1', 'receipt', 'receipt-1');

      expect(result.hasLicense).toBe(false);
      expect(result.reason).toBe('License has been revoked');
    });
  });

  describe('License Queries', () => {
    beforeEach(() => {
      // Create multiple licenses
      for (let i = 1; i <= 3; i++) {
        const params: LicenseProposalParams = {
          grantorId: `grantor-${i}`,
          granteeId: `grantee-${i}`,
          proposedBy: `grantor-${i}`,
          subject: {
            type: 'receipt',
            ids: [`receipt-${i}`],
          },
          purpose: 'test',
          duration: {
            type: 'perpetual',
          },
        };

        const result = licenseManager.proposeLicense(params);

        if (i <= 2) {
          licenseManager.ratifyLicense({
            licenseId: result.licenseId!,
            ratifiedBy: `grantor-${i}`,
            ratificationStatement: 'Test',
            humanAuthorship: true,
          });

          if (i === 1) {
            licenseManager.activateLicense(result.licenseId!);
          }
        }
      }
    });

    it('should get licenses by grantor', () => {
      const licenses = licenseManager.getLicensesByGrantor('grantor-1');

      expect(licenses).toHaveLength(1);
      expect(licenses[0].grantorId).toBe('grantor-1');
    });

    it('should get licenses by grantee', () => {
      const licenses = licenseManager.getLicensesByGrantee('grantee-2');

      expect(licenses).toHaveLength(1);
      expect(licenses[0].granteeId).toBe('grantee-2');
    });

    it('should get licenses by status', () => {
      const proposed = licenseManager.getLicensesByStatus('proposed');
      const ratified = licenseManager.getLicensesByStatus('ratified');
      const active = licenseManager.getLicensesByStatus('active');

      expect(proposed).toHaveLength(1);
      expect(ratified).toHaveLength(1);
      expect(active).toHaveLength(1);
    });

    it('should get active licenses for subject', () => {
      const licenses = licenseManager.getActiveLicensesForSubject('receipt', 'receipt-1');

      expect(licenses).toHaveLength(1);
      expect(licenses[0].scope.subject.ids).toContain('receipt-1');
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      // Create various licenses
      const types: SubjectType[] = ['receipt', 'artifact', 'agreement'];

      types.forEach((type, index) => {
        const params: LicenseProposalParams = {
          grantorId: `grantor-${index}`,
          granteeId: `grantee-${index}`,
          proposedBy: `grantor-${index}`,
          subject: {
            type,
            ids: [`${type}-1`, `${type}-2`],
          },
          purpose: 'test',
          duration: {
            type: 'perpetual',
          },
        };

        const result = licenseManager.proposeLicense(params);

        if (index === 0) {
          licenseManager.ratifyLicense({
            licenseId: result.licenseId!,
            ratifiedBy: `grantor-${index}`,
            ratificationStatement: 'Test',
            humanAuthorship: true,
          });
          licenseManager.activateLicense(result.licenseId!);
        } else if (index === 1) {
          licenseManager.ratifyLicense({
            licenseId: result.licenseId!,
            ratifiedBy: `grantor-${index}`,
            ratificationStatement: 'Test',
            humanAuthorship: true,
          });
          licenseManager.activateLicense(result.licenseId!);
          licenseManager.revokeLicense({
            licenseId: result.licenseId!,
            revokedBy: `grantor-${index}`,
            revocationStatement: 'Test revocation',
          });
        }
      });

      const stats = licenseManager.getStats();

      expect(stats.totalLicenses).toBe(3);
      expect(stats.activeLicenses).toBe(1);
      expect(stats.revokedLicenses).toBe(1);
      expect(stats.licensesByStatus.proposed).toBe(1);
      expect(stats.licensesByStatus.active).toBe(1);
      expect(stats.licensesByStatus.revoked).toBe(1);
      expect(stats.licensesBySubjectType.receipt).toBe(1);
      expect(stats.licensesBySubjectType.artifact).toBe(1);
      expect(stats.licensesBySubjectType.agreement).toBe(1);
      expect(stats.averageSubjectsPerLicense).toBe(2);
    });
  });

  describe('Persistence', () => {
    it('should persist licenses to disk', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);
      const licenseId = result.licenseId!;

      // Check file exists
      const filePath = path.join(testDataPath, `${licenseId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify content
      const content = fs.readFileSync(filePath, 'utf-8');
      const license = JSON.parse(content);
      expect(license.licenseId).toBe(licenseId);
      expect(license.grantorId).toBe('grantor-1');
    });

    it('should load licenses from disk', () => {
      const params: LicenseProposalParams = {
        grantorId: 'grantor-1',
        granteeId: 'grantee-1',
        proposedBy: 'grantor-1',
        subject: {
          type: 'receipt',
          ids: ['receipt-1'],
        },
        purpose: 'test',
        duration: {
          type: 'perpetual',
        },
      };

      const result = licenseManager.proposeLicense(params);
      const licenseId = result.licenseId!;

      // Create new manager instance
      const newManager = new LicenseManager(config, testDataPath);

      // Verify license was loaded
      const license = newManager.getLicense(licenseId);
      expect(license).toBeDefined();
      expect(license?.grantorId).toBe('grantor-1');
    });
  });
});
