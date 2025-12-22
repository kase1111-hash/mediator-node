import { EvidenceManager } from '../../src/dispute/EvidenceManager';
import { MediatorConfig, ContestedItem } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('EvidenceManager', () => {
  let evidenceManager: EvidenceManager;
  let config: MediatorConfig;
  const testDataPath = './test-data/evidence';

  beforeEach(() => {
    config = {
      chainEndpoint: 'http://localhost:3000',
      enableDisputeSystem: true,
      autoFreezeEvidence: true,
    } as MediatorConfig;

    evidenceManager = new EvidenceManager(config, testDataPath);
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  describe('freezeContestedItems', () => {
    it('should freeze contested items successfully', async () => {
      const disputeId = 'dispute-001';
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
        {
          itemId: 'settlement-001',
          itemType: 'settlement',
        },
      ];

      const result = await evidenceManager.freezeContestedItems(
        disputeId,
        contestedItems,
        'user-001'
      );

      expect(result.success).toBe(true);
      expect(result.frozenCount).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty contested items', async () => {
      const result = await evidenceManager.freezeContestedItems(
        'dispute-001',
        [],
        'user-001'
      );

      expect(result.success).toBe(true);
      expect(result.frozenCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect already frozen items', async () => {
      const disputeId1 = 'dispute-001';
      const disputeId2 = 'dispute-002';
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      // Freeze for first dispute
      await evidenceManager.freezeContestedItems(
        disputeId1,
        contestedItems,
        'user-001'
      );

      // Try to freeze for second dispute
      const result = await evidenceManager.freezeContestedItems(
        disputeId2,
        contestedItems,
        'user-002'
      );

      expect(result.success).toBe(false);
      expect(result.frozenCount).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('already frozen');
    });
  });

  describe('isItemFrozen', () => {
    it('should return true for frozen items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      expect(evidenceManager.isItemFrozen('intent-001')).toBe(true);
    });

    it('should return false for unfrozen items', () => {
      expect(evidenceManager.isItemFrozen('intent-999')).toBe(false);
    });
  });

  describe('canMutateItem', () => {
    it('should allow mutation of unfrozen items', () => {
      const result = evidenceManager.canMutateItem('intent-999', 'update');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should prevent mutation of frozen items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      const updateResult = evidenceManager.canMutateItem('intent-001', 'update');
      expect(updateResult.allowed).toBe(false);
      expect(updateResult.reason).toContain('under dispute');
      expect(updateResult.disputeId).toBe('dispute-001');

      const deleteResult = evidenceManager.canMutateItem('intent-001', 'delete');
      expect(deleteResult.allowed).toBe(false);
      expect(deleteResult.reason).toContain('under dispute');
    });
  });

  describe('recordMutationAttempt', () => {
    it('should record mutation attempts on frozen items', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      evidenceManager.recordMutationAttempt('intent-001', 'user-002', 'update');
      evidenceManager.recordMutationAttempt('intent-001', 'user-003', 'delete');

      const frozenItems = evidenceManager.getFrozenItemsForDispute('dispute-001');
      expect(frozenItems).toHaveLength(1);
      expect(frozenItems[0].mutationAttempts).toHaveLength(2);
      expect(frozenItems[0].mutationAttempts![0].attemptedBy).toBe('user-002');
      expect(frozenItems[0].mutationAttempts![1].attemptedBy).toBe('user-003');
    });

    it('should not record attempts on unfrozen items', () => {
      evidenceManager.recordMutationAttempt('intent-999', 'user-001', 'update');

      // Should not throw, just log a warning
      expect(evidenceManager.isItemFrozen('intent-999')).toBe(false);
    });
  });

  describe('unfreezeItemsForDispute', () => {
    it('should unfreeze all items for a dispute', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
        {
          itemId: 'settlement-001',
          itemType: 'settlement',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      expect(evidenceManager.isItemFrozen('intent-001')).toBe(true);
      expect(evidenceManager.isItemFrozen('settlement-001')).toBe(true);

      const unfrozenCount = evidenceManager.unfreezeItemsForDispute('dispute-001');

      expect(unfrozenCount).toBe(2);
      expect(evidenceManager.isItemFrozen('intent-001')).toBe(false);
      expect(evidenceManager.isItemFrozen('settlement-001')).toBe(false);
    });

    it('should return 0 for non-existent disputes', () => {
      const unfrozenCount = evidenceManager.unfreezeItemsForDispute('dispute-999');
      expect(unfrozenCount).toBe(0);
    });
  });

  describe('createEvidenceSnapshot', () => {
    it('should create a snapshot of frozen items', async () => {
      const disputeId = 'dispute-001';
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
        {
          itemId: 'settlement-001',
          itemType: 'settlement',
        },
      ];

      await evidenceManager.freezeContestedItems(
        disputeId,
        contestedItems,
        'user-001'
      );

      const snapshot = await evidenceManager.createEvidenceSnapshot(disputeId);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.disputeId).toBe(disputeId);
      expect(snapshot!.itemCount).toBe(2);
      expect(snapshot!.frozenItems).toHaveLength(2);
      expect(snapshot!.snapshotHash).toBeDefined();
      expect(snapshot!.exportPath).toBeDefined();

      // Verify file was created
      expect(fs.existsSync(snapshot!.exportPath!)).toBe(true);
    });

    it('should return null for disputes with no frozen items', async () => {
      const snapshot = await evidenceManager.createEvidenceSnapshot('dispute-999');
      expect(snapshot).toBeNull();
    });
  });

  describe('autoFreezeIfEnabled', () => {
    it('should freeze items when autoFreezeEvidence is true', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await evidenceManager.autoFreezeIfEnabled(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      expect(evidenceManager.isItemFrozen('intent-001')).toBe(true);
    });

    it('should not freeze items when autoFreezeEvidence is false', async () => {
      const configNoAuto = {
        ...config,
        autoFreezeEvidence: false,
      };

      const managerNoAuto = new EvidenceManager(configNoAuto, testDataPath);

      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await managerNoAuto.autoFreezeIfEnabled(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      expect(managerNoAuto.isItemFrozen('intent-001')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const contestedItems1: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
        {
          itemId: 'intent-002',
          itemType: 'intent',
        },
      ];

      const contestedItems2: ContestedItem[] = [
        {
          itemId: 'settlement-001',
          itemType: 'settlement',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems1,
        'user-001'
      );

      await evidenceManager.freezeContestedItems(
        'dispute-002',
        contestedItems2,
        'user-002'
      );

      // Record a mutation attempt
      evidenceManager.recordMutationAttempt('intent-001', 'user-003', 'update');

      const stats = evidenceManager.getStats();

      expect(stats.totalFrozenItems).toBe(3);
      expect(stats.itemsByStatus.under_dispute).toBe(3);
      expect(stats.itemsByStatus.active).toBe(0);
      expect(stats.totalMutationAttempts).toBe(1);
      expect(stats.activeDisputes).toBe(2);
    });
  });

  describe('persistence', () => {
    it('should persist frozen items to disk', async () => {
      const contestedItems: ContestedItem[] = [
        {
          itemId: 'intent-001',
          itemType: 'intent',
        },
      ];

      await evidenceManager.freezeContestedItems(
        'dispute-001',
        contestedItems,
        'user-001'
      );

      // Create new instance to test loading
      const newManager = new EvidenceManager(config, testDataPath);

      expect(newManager.isItemFrozen('intent-001')).toBe(true);
      const frozenItems = newManager.getFrozenItemsForDispute('dispute-001');
      expect(frozenItems).toHaveLength(1);
    });
  });
});
