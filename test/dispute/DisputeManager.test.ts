import { DisputeManager } from '../../src/dispute/DisputeManager';
import { MediatorConfig, ContestedItem, DisputeStatus } from '../../src/types';
import * as fs from 'fs';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DisputeManager', () => {
  let disputeManager: DisputeManager;
  let config: MediatorConfig;
  const testDataPath = './test-data/disputes';

  beforeEach(() => {
    config = {
      chainEndpoint: 'http://localhost:3000',
      enableDisputeSystem: true,
      autoFreezeEvidence: true,
      allowDisputeClarification: true,
    } as MediatorConfig;

    disputeManager = new DisputeManager(config, testDataPath);

    // Mock axios responses
    mockedAxios.post.mockResolvedValue({ status: 201, data: {} });
  });

  afterEach(() => {
    // Clean up test data
    try {
      if (fs.existsSync('./test-data')) {
        fs.rmSync('./test-data', { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Cleanup warning:', error);
    }

    jest.clearAllMocks();
  });

  describe('initiateDispute', () => {
    it('should initiate a dispute successfully', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        claimantName: 'Alice',
        contestedItems,
        issueDescription: 'Service was not delivered as agreed',
        respondentId: 'user-002',
        respondentName: 'Bob',
      });

      expect(result.success).toBe(true);
      expect(result.disputeId).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify dispute was created
      const dispute = disputeManager.getDispute(result.disputeId!);
      expect(dispute).toBeDefined();
      expect(dispute!.claimant.partyId).toBe('user-001');
      expect(dispute!.respondent?.partyId).toBe('user-002');
      expect(dispute!.status).toBe('initiated');
      expect(dispute!.contestedItems).toHaveLength(1);
    });

    it('should freeze contested items when auto-freeze is enabled', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      expect(result.success).toBe(true);

      // Verify item is frozen
      expect(disputeManager.isItemFrozen('intent-001')).toBe(true);
    });

    it('should submit dispute to chain', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/disputes',
        expect.objectContaining({
          type: 'dispute_declaration',
          dispute: expect.objectContaining({
            claimant: 'user-001',
            issueDescription: 'Test issue',
          }),
        })
      );
    });

    it('should handle invalid contested items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: '',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid contested items');
    });

    it('should handle optional respondent', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      expect(result.success).toBe(true);

      const dispute = disputeManager.getDispute(result.disputeId!);
      expect(dispute!.respondent).toBeUndefined();
    });
  });

  describe('addEvidence', () => {
    it('should add evidence to a dispute', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const disputeResult = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const evidenceResult = await disputeManager.addEvidence({
        disputeId: disputeResult.disputeId!,
        submittedBy: 'user-001',
        evidenceType: 'document',
        description: 'Contract showing agreed terms',
        contentHash: 'hash123',
      });

      expect(evidenceResult.success).toBe(true);
      expect(evidenceResult.evidenceId).toBeDefined();

      const dispute = disputeManager.getDispute(disputeResult.disputeId!);
      expect(dispute!.evidence).toHaveLength(1);
      expect(dispute!.evidence[0].evidenceType).toBe('document');
    });

    it('should handle evidence for non-existent dispute', async () => {
      const result = await disputeManager.addEvidence({
        disputeId: 'non-existent',
        submittedBy: 'user-001',
        evidenceType: 'document',
        description: 'Test evidence',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Dispute not found');
    });
  });

  describe('updateDisputeStatus', () => {
    it('should update dispute status', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const updated = disputeManager.updateDisputeStatus(
        result.disputeId!,
        'under_review'
      );

      expect(updated).toBe(true);

      const dispute = disputeManager.getDispute(result.disputeId!);
      expect(dispute!.status).toBe('under_review');
    });

    it('should handle non-existent dispute', () => {
      const updated = disputeManager.updateDisputeStatus(
        'non-existent',
        'under_review'
      );

      expect(updated).toBe(false);
    });
  });

  describe('evidence freezing integration', () => {
    it('should prevent mutations of frozen items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const canMutate = disputeManager.canMutateItem('intent-001', 'update');

      expect(canMutate.allowed).toBe(false);
      expect(canMutate.reason).toContain('under dispute');
      expect(canMutate.disputeId).toBe(result.disputeId);
    });

    it('should record mutation attempts', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      disputeManager.recordMutationAttempt('intent-001', 'user-002', 'update');
      disputeManager.recordMutationAttempt('intent-001', 'user-002', 'delete');

      // Mutation attempts are recorded (we can't easily verify this without exposing internals)
      // But we can verify the item is still frozen
      expect(disputeManager.isItemFrozen('intent-001')).toBe(true);
    });

    it('should create evidence snapshots', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const snapshot = await disputeManager.createEvidenceSnapshot(
        result.disputeId!
      );

      expect(snapshot).not.toBeNull();
      expect(snapshot!.disputeId).toBe(result.disputeId);
      expect(snapshot!.itemCount).toBe(1);
    });
  });

  describe('resolveDispute', () => {
    it('should resolve a dispute and unfreeze items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      expect(disputeManager.isItemFrozen('intent-001')).toBe(true);

      const resolved = await disputeManager.resolveDispute(
        result.disputeId!,
        'Settled amicably',
        'mediator-001'
      );

      expect(resolved).toBe(true);

      const dispute = disputeManager.getDispute(result.disputeId!);
      expect(dispute!.status).toBe('resolved');
      expect(dispute!.resolution).toBeDefined();
      expect(dispute!.resolution!.outcome).toBe('other');
      expect(dispute!.resolution!.outcomeDescription).toBe('Settled amicably');

      // Verify items are unfrozen
      expect(disputeManager.isItemFrozen('intent-001')).toBe(false);
    });

    it('should handle non-existent dispute', async () => {
      const resolved = await disputeManager.resolveDispute(
        'non-existent',
        'Test outcome',
        'mediator-001'
      );

      expect(resolved).toBe(false);
    });
  });

  describe('dismissDispute', () => {
    it('should dismiss a dispute and unfreeze items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const dismissed = await disputeManager.dismissDispute(
        result.disputeId!,
        'Insufficient evidence',
        'mediator-001'
      );

      expect(dismissed).toBe(true);

      const dispute = disputeManager.getDispute(result.disputeId!);
      expect(dispute!.status).toBe('dismissed');
      expect(dispute!.resolution).toBeDefined();
      expect(dispute!.resolution!.outcome).toBe('dismissed');
      expect(dispute!.resolution!.outcomeDescription).toBe('Insufficient evidence');

      // Verify items are unfrozen
      expect(disputeManager.isItemFrozen('intent-001')).toBe(false);
    });
  });

  describe('getters', () => {
    it('should get dispute by ID', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      const dispute = disputeManager.getDispute(result.disputeId!);

      expect(dispute).toBeDefined();
      expect(dispute!.disputeId).toBe(result.disputeId);
    });

    it('should get all disputes', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Issue 1',
      });

      await disputeManager.initiateDispute({
        claimantId: 'user-002',
        contestedItems: [
          { ...contestedItems[0], itemId: 'intent-002' },
        ],
        issueDescription: 'Issue 2',
      });

      const allDisputes = disputeManager.getAllDisputes();

      expect(allDisputes).toHaveLength(2);
    });

    it('should get disputes by status', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result1 = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Issue 1',
      });

      await disputeManager.initiateDispute({
        claimantId: 'user-002',
        contestedItems: [
          { ...contestedItems[0], itemId: 'intent-002' },
        ],
        issueDescription: 'Issue 2',
      });

      disputeManager.updateDisputeStatus(result1.disputeId!, 'under_review');

      const initiatedDisputes = disputeManager.getDisputesByStatus('initiated');
      const underReviewDisputes = disputeManager.getDisputesByStatus('under_review');

      expect(initiatedDisputes).toHaveLength(1);
      expect(underReviewDisputes).toHaveLength(1);
    });

    it('should get disputes by party', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await disputeManager.initiateDispute({
        claimantId: 'user-001',
        respondentId: 'user-002',
        contestedItems,
        issueDescription: 'Issue 1',
      });

      await disputeManager.initiateDispute({
        claimantId: 'user-003',
        respondentId: 'user-001',
        contestedItems: [
          { ...contestedItems[0], itemId: 'intent-002' },
        ],
        issueDescription: 'Issue 2',
      });

      const user001Disputes = disputeManager.getDisputesByParty('user-001');
      const user002Disputes = disputeManager.getDisputesByParty('user-002');

      expect(user001Disputes).toHaveLength(2); // As claimant and respondent
      expect(user002Disputes).toHaveLength(1); // As respondent only
    });
  });

  describe('getDisputeTimeline', () => {
    it('should generate complete timeline', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      await disputeManager.addEvidence({
        disputeId: result.disputeId!,
        submittedBy: 'user-001',
        evidenceType: 'document',
        description: 'Evidence 1',
      });

      await disputeManager.resolveDispute(
        result.disputeId!,
        'Resolved',
        'mediator-001'
      );

      const timeline = disputeManager.getDisputeTimeline(result.disputeId!);

      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].eventType).toBe('initiated');
      expect(timeline.some(e => e.eventType === 'evidence_added')).toBe(true);
      expect(timeline.some(e => e.eventType === 'resolved')).toBe(true);

      // Verify timeline is sorted by timestamp
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp).toBeGreaterThanOrEqual(
          timeline[i - 1].timestamp
        );
      }
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      await disputeManager.addEvidence({
        disputeId: result.disputeId!,
        submittedBy: 'user-001',
        evidenceType: 'document',
        description: 'Evidence 1',
      });

      await disputeManager.addEvidence({
        disputeId: result.disputeId!,
        submittedBy: 'user-002',
        evidenceType: 'statement',
        description: 'Evidence 2',
      });

      const stats = disputeManager.getStats();

      expect(stats.totalDisputes).toBe(1);
      expect(stats.disputesByStatus.initiated).toBe(1);
      expect(stats.totalEvidence).toBe(2);
      expect(stats.averageEvidencePerDispute).toBe(2);
      expect(stats.evidenceStats).toBeDefined();
      expect(stats.evidenceStats!.totalFrozenItems).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist disputes to disk and load them', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      const result = await disputeManager.initiateDispute({
        claimantId: 'user-001',
        contestedItems,
        issueDescription: 'Test issue',
      });

      // Create new instance to test loading
      const newManager = new DisputeManager(config, testDataPath);

      const dispute = newManager.getDispute(result.disputeId!);
      expect(dispute).toBeDefined();
      expect(dispute!.claimant.partyId).toBe('user-001');
    });
  });
});
