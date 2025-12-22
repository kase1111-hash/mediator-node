import {
  MediatorConfig,
  ContestedItem,
  DisputeDeclaration,
  Intent,
  ProposedSettlement,
  EffortReceipt,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { z } from 'zod';
import {
  FrozenItemSchema,
  EvidenceItemSchema,
  readAllJSONFiles,
  writeJSONFile,
  buildSafeFilePath,
} from '../validation';

/**
 * Item status for evidence freezing
 */
export type EvidenceItemStatus = 'active' | 'under_dispute' | 'dispute_resolved';

/**
 * Frozen item record
 */
export interface FrozenItem {
  itemId: string;
  itemType: 'intent' | 'settlement' | 'receipt' | 'agreement' | 'delegation';
  disputeId: string;
  frozenAt: number;
  frozenBy: string; // Who initiated the dispute
  snapshotHash: string; // Hash of item at freeze time
  status: EvidenceItemStatus;
  snapshot?: any; // Full snapshot of the item
  mutationAttempts?: Array<{
    timestamp: number;
    attemptedBy: string;
    operationType: 'update' | 'delete';
    rejected: boolean;
    auditLog: string;
  }>;
}

/**
 * Evidence snapshot for export
 */
export interface EvidenceSnapshot {
  snapshotId: string;
  disputeId: string;
  createdAt: number;
  itemCount: number;
  frozenItems: FrozenItem[];
  snapshotHash: string; // Hash of entire snapshot
  exportPath?: string;
}

/**
 * Manages evidence freezing and protection
 * Prevents mutation of items under dispute
 */
export class EvidenceManager {
  private config: MediatorConfig;
  private frozenItems: Map<string, FrozenItem> = new Map(); // itemId -> FrozenItem
  private dataPath: string;

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/evidence'
  ) {
    this.config = config;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing frozen items
    this.loadFrozenItems();

    logger.info('EvidenceManager initialized', {
      dataPath,
      frozenItemsLoaded: this.frozenItems.size,
    });
  }

  /**
   * Freeze contested items when dispute is initiated
   */
  public async freezeContestedItems(
    disputeId: string,
    contestedItems: ContestedItem[],
    frozenBy: string
  ): Promise<{
    success: boolean;
    frozenCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let frozenCount = 0;

    for (const item of contestedItems) {
      try {
        // Check if already frozen first
        if (this.frozenItems.has(item.itemId)) {
          const existingDisputeId = this.frozenItems.get(item.itemId)?.disputeId;
          errors.push(
            `Item ${item.itemType} ${item.itemId} is already frozen under dispute ${existingDisputeId}`
          );
          continue;
        }

        const frozen = await this.freezeItem(disputeId, item, frozenBy);
        if (frozen) {
          frozenCount++;
        }
      } catch (error) {
        errors.push(`Failed to freeze ${item.itemType} ${item.itemId}: ${error}`);
        logger.error('Error freezing item', {
          itemId: item.itemId,
          itemType: item.itemType,
          error,
        });
      }
    }

    logger.info('Contested items frozen', {
      disputeId,
      frozenCount,
      totalItems: contestedItems.length,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      frozenCount,
      errors,
    };
  }

  /**
   * Freeze a single item
   */
  private async freezeItem(
    disputeId: string,
    item: ContestedItem,
    frozenBy: string
  ): Promise<boolean> {
    // Check if already frozen
    if (this.frozenItems.has(item.itemId)) {
      logger.warn('Item already frozen', {
        itemId: item.itemId,
        existingDisputeId: this.frozenItems.get(item.itemId)?.disputeId,
      });
      return false;
    }

    // Get snapshot of the item
    const snapshot = await this.captureItemSnapshot(item);

    if (!snapshot) {
      logger.warn('Could not capture snapshot for item', {
        itemId: item.itemId,
        itemType: item.itemType,
      });
      return false;
    }

    // Create frozen item record
    const frozenItem: FrozenItem = {
      itemId: item.itemId,
      itemType: item.itemType,
      disputeId,
      frozenAt: Date.now(),
      frozenBy,
      snapshotHash: this.hashSnapshot(snapshot),
      status: 'under_dispute',
      snapshot,
      mutationAttempts: [],
    };

    this.frozenItems.set(item.itemId, frozenItem);
    this.saveFrozenItem(frozenItem);

    logger.info('Item frozen', {
      itemId: item.itemId,
      itemType: item.itemType,
      disputeId,
    });

    return true;
  }

  /**
   * Capture snapshot of an item
   */
  private async captureItemSnapshot(item: ContestedItem): Promise<any | null> {
    // In a real implementation, this would fetch from the chain/database
    // For now, we return a placeholder structure
    return {
      itemId: item.itemId,
      itemType: item.itemType,
      itemHash: item.itemHash,
      capturedAt: Date.now(),
      // Additional fields would be populated from actual data source
    };
  }

  /**
   * Hash a snapshot for integrity verification
   */
  private hashSnapshot(snapshot: any): string {
    const content = JSON.stringify(snapshot, Object.keys(snapshot).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if an item is frozen (under dispute)
   */
  public isItemFrozen(itemId: string): boolean {
    const item = this.frozenItems.get(itemId);
    return item !== undefined && item.status === 'under_dispute';
  }

  /**
   * Check if mutation is allowed for an item
   */
  public canMutateItem(itemId: string, operationType: 'update' | 'delete'): {
    allowed: boolean;
    reason?: string;
    disputeId?: string;
  } {
    const frozenItem = this.frozenItems.get(itemId);

    if (!frozenItem) {
      return { allowed: true };
    }

    if (frozenItem.status === 'under_dispute') {
      return {
        allowed: false,
        reason: 'Item is under dispute and cannot be modified',
        disputeId: frozenItem.disputeId,
      };
    }

    if (frozenItem.status === 'dispute_resolved') {
      // After resolution, items can be mutated again
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Record a mutation attempt (for audit purposes)
   */
  public recordMutationAttempt(
    itemId: string,
    attemptedBy: string,
    operationType: 'update' | 'delete'
  ): void {
    const frozenItem = this.frozenItems.get(itemId);

    if (!frozenItem) {
      return;
    }

    if (!frozenItem.mutationAttempts) {
      frozenItem.mutationAttempts = [];
    }

    frozenItem.mutationAttempts.push({
      timestamp: Date.now(),
      attemptedBy,
      operationType,
      rejected: true,
      auditLog: `Attempted ${operationType} on frozen item ${itemId} under dispute ${frozenItem.disputeId}`,
    });

    this.saveFrozenItem(frozenItem);

    logger.warn('Mutation attempt on frozen item recorded', {
      itemId,
      operationType,
      attemptedBy,
      disputeId: frozenItem.disputeId,
    });
  }

  /**
   * Unfreeze items when dispute is resolved
   */
  public unfreezeItemsForDispute(disputeId: string): number {
    let unfrozenCount = 0;

    for (const [itemId, frozenItem] of this.frozenItems.entries()) {
      if (frozenItem.disputeId === disputeId && frozenItem.status === 'under_dispute') {
        frozenItem.status = 'dispute_resolved';
        this.saveFrozenItem(frozenItem);
        unfrozenCount++;
      }
    }

    logger.info('Items unfrozen for resolved dispute', {
      disputeId,
      unfrozenCount,
    });

    return unfrozenCount;
  }

  /**
   * Get frozen item details
   */
  public getFrozenItem(itemId: string): FrozenItem | undefined {
    return this.frozenItems.get(itemId);
  }

  /**
   * Get all frozen items for a dispute
   */
  public getFrozenItemsForDispute(disputeId: string): FrozenItem[] {
    return Array.from(this.frozenItems.values()).filter(
      (item) => item.disputeId === disputeId
    );
  }

  /**
   * Create evidence snapshot for export
   */
  public async createEvidenceSnapshot(
    disputeId: string
  ): Promise<EvidenceSnapshot | null> {
    const frozenItems = this.getFrozenItemsForDispute(disputeId);

    if (frozenItems.length === 0) {
      logger.warn('No frozen items found for dispute', { disputeId });
      return null;
    }

    const snapshotId = `snapshot-${disputeId}-${Date.now()}`;
    const snapshot: EvidenceSnapshot = {
      snapshotId,
      disputeId,
      createdAt: Date.now(),
      itemCount: frozenItems.length,
      frozenItems: frozenItems.map((item) => ({
        ...item,
        // Include full snapshot in export
      })),
      snapshotHash: this.hashSnapshot(frozenItems),
    };

    // Export to file
    const exportPath = await this.exportSnapshot(snapshot);
    snapshot.exportPath = exportPath;

    logger.info('Evidence snapshot created', {
      snapshotId,
      disputeId,
      itemCount: frozenItems.length,
      exportPath,
    });

    return snapshot;
  }

  /**
   * Export snapshot to file
   */
  private async exportSnapshot(snapshot: EvidenceSnapshot): Promise<string> {
    const snapshotsDir = path.join(this.dataPath, 'snapshots');

    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }

    const filePath = path.join(snapshotsDir, `${snapshot.snapshotId}.json`);

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

    logger.debug('Snapshot exported to file', {
      snapshotId: snapshot.snapshotId,
      filePath,
    });

    return filePath;
  }

  /**
   * Verify snapshot integrity
   */
  public verifySnapshotIntegrity(snapshot: EvidenceSnapshot): boolean {
    const recomputedHash = this.hashSnapshot(snapshot.frozenItems);
    return snapshot.snapshotHash === recomputedHash;
  }

  /**
   * Get evidence statistics
   */
  public getStats(): {
    totalFrozenItems: number;
    itemsByType: Record<string, number>;
    itemsByStatus: Record<EvidenceItemStatus, number>;
    totalMutationAttempts: number;
    activeDisputes: number;
  } {
    const itemsByType: Record<string, number> = {};
    const itemsByStatus: Record<EvidenceItemStatus, number> = {
      active: 0,
      under_dispute: 0,
      dispute_resolved: 0,
    };

    let totalMutationAttempts = 0;
    const activeDisputeIds = new Set<string>();

    for (const item of this.frozenItems.values()) {
      // Count by type
      itemsByType[item.itemType] = (itemsByType[item.itemType] || 0) + 1;

      // Count by status
      itemsByStatus[item.status]++;

      // Count mutation attempts
      totalMutationAttempts += item.mutationAttempts?.length || 0;

      // Track active disputes
      if (item.status === 'under_dispute') {
        activeDisputeIds.add(item.disputeId);
      }
    }

    return {
      totalFrozenItems: this.frozenItems.size,
      itemsByType,
      itemsByStatus,
      totalMutationAttempts,
      activeDisputes: activeDisputeIds.size,
    };
  }

  /**
   * Save frozen item to disk with validation
   */
  private saveFrozenItem(item: FrozenItem): void {
    try {
      // SECURITY: Use safe file path building to prevent path traversal
      const filePath = buildSafeFilePath(this.dataPath, item.itemId, '.json');

      // SECURITY: Validate frozen item data before writing
      writeJSONFile(filePath, item, FrozenItemSchema as unknown as z.ZodType<FrozenItem>, {
        baseDir: this.dataPath,
        createDir: true,
      });

      logger.debug('Frozen item saved successfully', {
        itemId: item.itemId,
      });
    } catch (error: any) {
      logger.error('Error saving frozen item', {
        itemId: item.itemId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Load all frozen items from disk with validation
   */
  private loadFrozenItems(): void {
    try {
      // SECURITY: Use safe file operations with schema validation
      const items = readAllJSONFiles(this.dataPath, FrozenItemSchema as unknown as z.ZodType<FrozenItem>, {
        baseDir: this.dataPath,
      });

      // Load validated frozen items into memory (skip snapshot files)
      for (const item of items) {
        // Skip if this looks like a snapshot file
        if (item.itemId && item.itemId.startsWith('snapshot-')) {
          continue;
        }
        this.frozenItems.set(item.itemId, item);
      }

      logger.info('Frozen items loaded from disk', {
        count: this.frozenItems.size,
      });
    } catch (error: any) {
      logger.error('Error loading frozen items', {
        error: error.message,
      });
    }
  }

  /**
   * Auto-freeze items if configured
   */
  public async autoFreezeIfEnabled(
    disputeId: string,
    contestedItems: ContestedItem[],
    frozenBy: string
  ): Promise<void> {
    if (this.config.autoFreezeEvidence === false) {
      logger.debug('Auto-freeze disabled, skipping', { disputeId });
      return;
    }

    await this.freezeContestedItems(disputeId, contestedItems, frozenBy);
  }
}
