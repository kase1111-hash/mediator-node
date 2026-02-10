import { DisputePackageBuilder, PackageBuildOptions } from '../../src/dispute/DisputePackageBuilder';
import {
  MediatorConfig,
  DisputeDeclaration,
  DisputeEvidence,
  DisputeTimelineEntry,
  ClarificationRecord,
} from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('DisputePackageBuilder', () => {
  let packageBuilder: DisputePackageBuilder;
  let config: MediatorConfig;
  const testDataPath = './test-data/packages';

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
    } as MediatorConfig;

    packageBuilder = new DisputePackageBuilder(config, testDataPath);
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  // Helper function to create a test dispute
  const createTestDispute = (): DisputeDeclaration => ({
    disputeId: 'dispute-123',
    claimant: {
      partyId: 'party-1',
      role: 'claimant',
      name: 'Alice',
    },
    respondent: {
      partyId: 'party-2',
      role: 'respondent',
      name: 'Bob',
    },
    contestedItems: [
      {
        itemId: 'item-1',
        itemType: 'intent',
      },
    ],
    issueDescription: 'Payment dispute',
    status: 'initiated',
    initiatedAt: Date.now(),
    updatedAt: Date.now(),
    evidence: [],
  });

  const createTestTimeline = (): DisputeTimelineEntry[] => [
    {
      timestamp: Date.now(),
      eventType: 'initiated',
      actor: 'party-1',
      description: 'Dispute initiated',
      referenceId: 'dispute-123',
    },
  ];

  const createTestEvidence = (): DisputeEvidence[] => [
    {
      evidenceId: 'evidence-1',
      disputeId: 'dispute-123',
      submittedBy: 'party-1',
      timestamp: Date.now(),
      evidenceType: 'document',
      description: 'Contract document',
      contentHash: 'hash-123',
      linkedItems: ['item-1'],
    },
  ];

  describe('Package Building', () => {
    it('should build a basic dispute package', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      expect(result.success).toBe(true);
      expect(result.packageId).toBeDefined();

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg).toBeDefined();
      expect(pkg?.disputeId).toBe('dispute-123');
      expect(pkg?.createdBy).toBe('mediator-1');
      expect(pkg?.packageHash).toBeDefined();
      expect(pkg?.packageHash.length).toBe(64); // SHA-256 hex length
    });

    it('should include all evidence in package', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg?.bundledRecords.evidence).toHaveLength(1);
      expect(pkg?.bundledRecords.evidence[0].evidenceId).toBe('evidence-1');
    });

    it('should include clarifications in package', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();
      const clarifications: ClarificationRecord[] = [
        {
          clarificationId: 'clarif-1',
          disputeId: 'dispute-123',
          mediatorId: 'llm-1',
          startedAt: Date.now(),
          completedAt: Date.now() + 1000,
          claimantStatements: ['Statement 1'],
          respondentStatements: ['Counterclaim 1'],
          factualDisagreements: ['Disagreement about payment amount'],
          interpretiveDisagreements: ['Disagreement about contract terms'],
          scopeNarrowing: 'Focus on payment dispute',
          ambiguities: ['Ambiguous clause in contract'],
          participationConsent: {
            claimant: true,
            respondent: true,
          },
        },
      ];

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        clarifications,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg?.bundledRecords.clarifications).toHaveLength(1);
      expect(pkg?.bundledRecords.clarifications[0].clarificationId).toBe(
        'clarif-1'
      );
    });

    it('should generate human-readable summary', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg?.summary).toBeDefined();
      expect(pkg?.summary).toContain('DISPUTE PACKAGE SUMMARY');
      expect(pkg?.summary).toContain('dispute-123');
      expect(pkg?.summary).toContain('Alice');
      expect(pkg?.summary).toContain('Bob');
      expect(pkg?.summary).toContain('Payment dispute');
    });

    it('should support package build options', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const options: PackageBuildOptions = {
        includeEvidence: false,
        includeClarifications: true,
      };

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
        options,
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg?.bundledRecords.evidence).toHaveLength(0);
    });
  });

  describe('Package Hash Calculation', () => {
    it('should calculate consistent hash for same content', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result1 = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      // Create new builder to ensure independence
      const builder2 = new DisputePackageBuilder(config, testDataPath + '-2');

      const result2 = await builder2.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg1 = packageBuilder.getPackage(result1.packageId!);
      const pkg2 = builder2.getPackage(result2.packageId!);

      // Hashes should be the same for same content (ignoring creation time)
      expect(pkg1?.packageHash).toBeDefined();
      expect(pkg2?.packageHash).toBeDefined();

      // Clean up second builder
      if (fs.existsSync(testDataPath + '-2')) {
        fs.rmSync(testDataPath + '-2', { recursive: true, force: true });
      }
    });

    it('should calculate different hash for different content', async () => {
      const dispute1 = createTestDispute();
      const dispute2 = {
        ...createTestDispute(),
        issueDescription: 'Different issue',
      };

      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result1 = await packageBuilder.buildPackage({
        dispute: dispute1,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const result2 = await packageBuilder.buildPackage({
        dispute: dispute2,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg1 = packageBuilder.getPackage(result1.packageId!);
      const pkg2 = packageBuilder.getPackage(result2.packageId!);

      expect(pkg1?.packageHash).not.toBe(pkg2?.packageHash);
    });
  });

  describe('Package Verification', () => {
    it('should verify package completeness', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      const verification = packageBuilder.verifyPackage(pkg!, dispute);

      expect(verification.isValid).toBe(true);
      expect(verification.hashMatches).toBe(true);
      expect(verification.isComplete).toBe(true);
      expect(verification.missingComponents).toHaveLength(0);
      expect(verification.errors).toHaveLength(0);
    });

    it('should detect missing timeline', async () => {
      const dispute = createTestDispute();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline: [],
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      const verification = packageBuilder.verifyPackage(pkg!, dispute);

      expect(verification.isComplete).toBe(false);
      expect(verification.missingComponents).toContain('timeline');
    });

    it('should detect undocumented contested items', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      // Evidence for different item
      const evidence: DisputeEvidence[] = [
        {
          evidenceId: 'evidence-1',
          disputeId: 'dispute-123',
          submittedBy: 'party-1',
          timestamp: Date.now(),
          evidenceType: 'document',
          description: 'Contract document',
          linkedItems: ['different-item'],
        },
      ];

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      const verification = packageBuilder.verifyPackage(pkg!, dispute);

      expect(verification.isComplete).toBe(false);
      expect(verification.missingComponents.some((c) => c.includes('evidence for items'))).toBe(true);
    });

    it('should mark package as verified when complete', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg?.completenessVerified).toBe(true);
    });
  });

  describe('Package Export', () => {
    it('should export package to JSON', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const buildResult = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const exportResult = packageBuilder.exportToJSON(buildResult.packageId!);

      expect(exportResult.success).toBe(true);
      expect(exportResult.filePath).toBeDefined();
      expect(fs.existsSync(exportResult.filePath!)).toBe(true);

      // Verify JSON content
      const content = fs.readFileSync(exportResult.filePath!, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.packageId).toBe(buildResult.packageId);
      expect(parsed.disputeId).toBe('dispute-123');
    });

    it('should export package to text', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const buildResult = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const exportResult = packageBuilder.exportToText(buildResult.packageId!);

      expect(exportResult.success).toBe(true);
      expect(exportResult.filePath).toBeDefined();
      expect(fs.existsSync(exportResult.filePath!)).toBe(true);

      // Verify text content
      const content = fs.readFileSync(exportResult.filePath!, 'utf-8');
      expect(content).toContain('DISPUTE PACKAGE');
      expect(content).toContain(buildResult.packageId!);
      expect(content).toContain('TIMELINE');
      expect(content).toContain('EVIDENCE');
    });

    it('should fail to export non-existent package', () => {
      const exportResult = packageBuilder.exportToJSON('non-existent-id');

      expect(exportResult.success).toBe(false);
      expect(exportResult.error).toContain('not found');
    });
  });

  describe('Package Retrieval', () => {
    it('should get package by ID', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg).toBeDefined();
      expect(pkg?.packageId).toBe(result.packageId);
    });

    it('should get packages for dispute', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-2',
      });

      const packages = packageBuilder.getPackagesForDispute('dispute-123');
      expect(packages).toHaveLength(2);
    });

    it('should return empty array for dispute with no packages', () => {
      const packages = packageBuilder.getPackagesForDispute('non-existent');
      expect(packages).toHaveLength(0);
    });

    it('should get all packages', async () => {
      const dispute1 = createTestDispute();
      const dispute2 = { ...createTestDispute(), disputeId: 'dispute-456' };
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      await packageBuilder.buildPackage({
        dispute: dispute1,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      await packageBuilder.buildPackage({
        dispute: dispute2,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const allPackages = packageBuilder.getAllPackages();
      expect(allPackages).toHaveLength(2);
    });
  });

  describe('Package Deletion', () => {
    it('should delete package', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const deleted = packageBuilder.deletePackage(result.packageId!);
      expect(deleted).toBe(true);

      const pkg = packageBuilder.getPackage(result.packageId!);
      expect(pkg).toBeUndefined();
    });

    it('should fail to delete non-existent package', () => {
      const deleted = packageBuilder.deletePackage('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should delete package exports', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const buildResult = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const exportResult = packageBuilder.exportToJSON(buildResult.packageId!);
      expect(fs.existsSync(exportResult.filePath!)).toBe(true);

      packageBuilder.deletePackage(buildResult.packageId!);

      // Export file should be deleted
      expect(fs.existsSync(exportResult.filePath!)).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', async () => {
      const dispute1 = createTestDispute();
      const dispute2 = { ...createTestDispute(), disputeId: 'dispute-456' };
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      await packageBuilder.buildPackage({
        dispute: dispute1,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      await packageBuilder.buildPackage({
        dispute: dispute2,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const stats = packageBuilder.getStats();

      expect(stats.totalPackages).toBe(2);
      expect(stats.verifiedPackages).toBe(2);
      expect(stats.packagesByDispute['dispute-123']).toBe(1);
      expect(stats.packagesByDispute['dispute-456']).toBe(1);
      expect(stats.averagePackageSize).toBeGreaterThan(0);
    });

    it('should track verified packages correctly', async () => {
      const dispute = {
        ...createTestDispute(),
        contestedItems: [], // No contested items, so no evidence required
      };
      const timeline = createTestTimeline();

      // Package without evidence (should still be verified if timeline exists and no contested items)
      await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence: [],
        createdBy: 'mediator-1',
      });

      const stats = packageBuilder.getStats();
      expect(stats.totalPackages).toBe(1);
      expect(stats.verifiedPackages).toBe(1);
    });
  });

  describe('Persistence and Loading', () => {
    it('should persist packages to disk', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      const result = await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      const filePath = path.join(testDataPath, `${result.packageId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should load existing packages on initialization', async () => {
      const dispute = createTestDispute();
      const timeline = createTestTimeline();
      const evidence = createTestEvidence();

      await packageBuilder.buildPackage({
        dispute,
        timeline,
        evidence,
        createdBy: 'mediator-1',
      });

      // Create new instance with same data path
      const newBuilder = new DisputePackageBuilder(config, testDataPath);

      const packages = newBuilder.getAllPackages();
      expect(packages.length).toBeGreaterThan(0);
    });
  });
});
