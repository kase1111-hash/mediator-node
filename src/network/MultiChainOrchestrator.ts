/**
 * Multi-Chain Orchestration System
 *
 * Enables cross-chain mediation, coordination, and settlement
 * across multiple NatLangChain instances.
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { Intent, ProposedSettlement, MediatorConfig } from '../types';
import { logger } from '../utils/logger';

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: string;
  chainName: string;
  endpoint: string;
  websocketEndpoint?: string;
  consensusMode: 'permissionless' | 'dpos' | 'poa' | 'hybrid';
  enabled: boolean;
  priority: number; // Higher = more important
  capabilities: string[]; // e.g., ['high_value', 'fast_finality', 'low_fees']
}

/**
 * Cross-chain intent bridge
 */
export interface CrossChainIntent extends Intent {
  sourceChain: string;
  targetChain?: string; // If looking for cross-chain match
  crossChainBridgeable: boolean;
}

/**
 * Cross-chain settlement
 */
export interface CrossChainSettlement extends ProposedSettlement {
  chainA: string; // Chain of intent A
  chainB: string; // Chain of intent B
  bridgeProtocol?: string; // Bridge mechanism if needed
  escrowChain?: string; // Chain holding escrow
}

/**
 * Chain sync status
 */
export interface ChainSyncStatus {
  chainId: string;
  lastBlockSynced: number;
  lastSyncTime: number;
  syncedIntents: number;
  pendingIntents: number;
  isHealthy: boolean;
  lag: number; // Seconds behind
}

/**
 * MultiChainOrchestrator manages mediation across multiple chains
 *
 * Features:
 * - Monitor multiple NatLangChain instances simultaneously
 * - Cross-chain intent matching and settlement
 * - Load balancing across chains
 * - Unified intent pool with chain metadata
 * - Cross-chain escrow coordination
 */
export class MultiChainOrchestrator extends EventEmitter {
  private config: MediatorConfig;
  private chains: Map<string, ChainConfig> = new Map();
  private chainStatuses: Map<string, ChainSyncStatus> = new Map();
  private crossChainIntents: Map<string, CrossChainIntent> = new Map(); // intentHash -> intent

  private syncInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  private readonly SYNC_INTERVAL = 10000; // 10 seconds
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor(config: MediatorConfig) {
    super();
    this.config = config;

    // Load chain configurations
    this.loadChainConfigs();
  }

  /**
   * Start multi-chain orchestration
   */
  public async start(): Promise<void> {
    logger.info('Starting multi-chain orchestrator', {
      chains: this.chains.size,
      enabledChains: Array.from(this.chains.values()).filter((c) => c.enabled).length,
    });

    // Start periodic tasks
    this.syncInterval = setInterval(() => this.syncAllChains(), this.SYNC_INTERVAL);
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.HEALTH_CHECK_INTERVAL
    );

    // Initial sync
    await this.syncAllChains();

    logger.info('Multi-chain orchestrator started', {
      chains: Array.from(this.chains.keys()),
    });
  }

  /**
   * Stop orchestrator
   */
  public stop(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    logger.info('Multi-chain orchestrator stopped');
  }

  /**
   * Add chain to orchestration
   */
  public addChain(chainConfig: ChainConfig): void {
    this.chains.set(chainConfig.chainId, chainConfig);

    // Initialize sync status
    this.chainStatuses.set(chainConfig.chainId, {
      chainId: chainConfig.chainId,
      lastBlockSynced: 0,
      lastSyncTime: 0,
      syncedIntents: 0,
      pendingIntents: 0,
      isHealthy: true,
      lag: 0,
    });

    logger.info('Added chain to orchestrator', {
      chainId: chainConfig.chainId,
      chainName: chainConfig.chainName,
      endpoint: chainConfig.endpoint,
    });
  }

  /**
   * Remove chain from orchestration
   */
  public removeChain(chainId: string): void {
    this.chains.delete(chainId);
    this.chainStatuses.delete(chainId);

    // Remove intents from this chain
    for (const [intentHash, intent] of this.crossChainIntents.entries()) {
      if (intent.sourceChain === chainId) {
        this.crossChainIntents.delete(intentHash);
      }
    }

    logger.info('Removed chain from orchestrator', { chainId });
  }

  /**
   * Get all intents across all chains
   */
  public getAllIntents(): CrossChainIntent[] {
    return Array.from(this.crossChainIntents.values());
  }

  /**
   * Find cross-chain alignment candidates
   *
   * Matches intents from different chains that could form settlements
   */
  public findCrossChainCandidates(): {
    intentA: CrossChainIntent;
    intentB: CrossChainIntent;
    bridgeRequired: boolean;
  }[] {
    const candidates: {
      intentA: CrossChainIntent;
      intentB: CrossChainIntent;
      bridgeRequired: boolean;
    }[] = [];

    const intents = Array.from(this.crossChainIntents.values());

    // Find complementary intents from different chains
    for (let i = 0; i < intents.length; i++) {
      for (let j = i + 1; j < intents.length; j++) {
        const intentA = intents[i];
        const intentB = intents[j];

        // Check if from different chains and both bridgeable
        if (
          intentA.sourceChain !== intentB.sourceChain &&
          intentA.crossChainBridgeable &&
          intentB.crossChainBridgeable
        ) {
          // Simple semantic matching (in production, use embeddings)
          const semanticMatch = this.calculateSemanticMatch(intentA, intentB);

          if (semanticMatch > 0.6) {
            candidates.push({
              intentA,
              intentB,
              bridgeRequired: true,
            });
          }
        }
      }
    }

    logger.debug('Cross-chain candidate search completed', {
      totalIntents: intents.length,
      candidatesFound: candidates.length,
    });

    return candidates;
  }

  /**
   * Submit cross-chain settlement
   *
   * Coordinates settlement submission across multiple chains
   */
  public async submitCrossChainSettlement(
    settlement: CrossChainSettlement
  ): Promise<{ success: boolean; chainResults: Record<string, any> }> {
    logger.info('Submitting cross-chain settlement', {
      settlementId: settlement.id,
      chainA: settlement.chainA,
      chainB: settlement.chainB,
    });

    const chainResults: Record<string, any> = {};

    try {
      // Submit to chain A
      const chainAConfig = this.chains.get(settlement.chainA);
      if (!chainAConfig) {
        throw new Error(`Chain ${settlement.chainA} not found`);
      }

      const resultA = await this.submitSettlementToChain(chainAConfig, settlement);
      chainResults[settlement.chainA] = resultA;

      // Submit to chain B if different
      if (settlement.chainB !== settlement.chainA) {
        const chainBConfig = this.chains.get(settlement.chainB);
        if (!chainBConfig) {
          throw new Error(`Chain ${settlement.chainB} not found`);
        }

        const resultB = await this.submitSettlementToChain(chainBConfig, settlement);
        chainResults[settlement.chainB] = resultB;
      }

      // If escrow chain specified, submit there too
      if (settlement.escrowChain && settlement.escrowChain !== settlement.chainA && settlement.escrowChain !== settlement.chainB) {
        const escrowChainConfig = this.chains.get(settlement.escrowChain);
        if (escrowChainConfig) {
          const escrowResult = await this.submitSettlementToChain(escrowChainConfig, settlement);
          chainResults[settlement.escrowChain] = escrowResult;
        }
      }

      logger.info('Cross-chain settlement submitted successfully', {
        settlementId: settlement.id,
        chains: Object.keys(chainResults),
      });

      return { success: true, chainResults };
    } catch (error: any) {
      logger.error('Cross-chain settlement submission failed', {
        settlementId: settlement.id,
        error: error.message,
        chainResults,
      });

      return { success: false, chainResults };
    }
  }

  /**
   * Get orchestration statistics
   */
  public getStats(): {
    totalChains: number;
    enabledChains: number;
    healthyChains: number;
    totalIntents: number;
    intentsByChain: Record<string, number>;
    crossChainCandidates: number;
  } {
    const enabledChains = Array.from(this.chains.values()).filter((c) => c.enabled).length;
    const healthyChains = Array.from(this.chainStatuses.values()).filter((s) => s.isHealthy)
      .length;

    const intentsByChain: Record<string, number> = {};
    for (const intent of this.crossChainIntents.values()) {
      intentsByChain[intent.sourceChain] = (intentsByChain[intent.sourceChain] || 0) + 1;
    }

    return {
      totalChains: this.chains.size,
      enabledChains,
      healthyChains,
      totalIntents: this.crossChainIntents.size,
      intentsByChain,
      crossChainCandidates: this.findCrossChainCandidates().length,
    };
  }

  /**
   * Get chain status
   */
  public getChainStatus(chainId: string): ChainSyncStatus | undefined {
    return this.chainStatuses.get(chainId);
  }

  /**
   * Load chain configurations
   */
  private loadChainConfigs(): void {
    // Load from environment or config file
    const primaryChain: ChainConfig = {
      chainId: this.config.chainId,
      chainName: 'Primary Chain',
      endpoint: this.config.chainEndpoint,
      websocketEndpoint: this.config.webSocketEndpoint,
      consensusMode: (this.config.consensusMode as any) || 'permissionless',
      enabled: true,
      priority: 1,
      capabilities: ['high_value', 'fast_finality'],
    };

    this.addChain(primaryChain);

    // Load additional chains from config
    const additionalChains = this.config.additionalChains || [];
    for (const chainConfig of additionalChains) {
      this.addChain(chainConfig as ChainConfig);
    }
  }

  /**
   * Sync all chains
   */
  private async syncAllChains(): Promise<void> {
    const chains = Array.from(this.chains.values()).filter((c) => c.enabled);

    const syncTasks = chains.map(async (chain) => {
      try {
        await this.syncChain(chain);
      } catch (error: any) {
        logger.error('Chain sync failed', {
          chainId: chain.chainId,
          error: error.message,
        });

        // Mark chain as unhealthy
        const status = this.chainStatuses.get(chain.chainId);
        if (status) {
          status.isHealthy = false;
        }
      }
    });

    await Promise.allSettled(syncTasks);
  }

  /**
   * Sync a single chain
   */
  private async syncChain(chain: ChainConfig): Promise<void> {
    try {
      const response = await axios.get(`${chain.endpoint}/api/v1/intents?status=pending`, {
        timeout: 10000,
      });

      const intents: Intent[] = response.data.intents || [];

      // Convert to cross-chain intents
      for (const intent of intents) {
        const crossChainIntent: CrossChainIntent = {
          ...intent,
          sourceChain: chain.chainId,
          crossChainBridgeable: true, // Default to true
        };

        this.crossChainIntents.set(intent.hash, crossChainIntent);
      }

      // Update sync status
      const status = this.chainStatuses.get(chain.chainId);
      if (status) {
        status.lastSyncTime = Date.now();
        status.syncedIntents = intents.length;
        status.isHealthy = true;
        status.lag = 0;
      }

      logger.debug('Chain synced successfully', {
        chainId: chain.chainId,
        intentsSynced: intents.length,
      });
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Perform health checks on all chains
   */
  private async performHealthChecks(): Promise<void> {
    const chains = Array.from(this.chains.values()).filter((c) => c.enabled);

    for (const chain of chains) {
      try {
        const response = await axios.get(`${chain.endpoint}/health`, {
          timeout: 5000,
        });

        const status = this.chainStatuses.get(chain.chainId);
        if (status) {
          status.isHealthy = response.status === 200;
        }
      } catch (error) {
        const status = this.chainStatuses.get(chain.chainId);
        if (status) {
          status.isHealthy = false;
        }
      }
    }
  }

  /**
   * Submit settlement to a specific chain
   */
  private async submitSettlementToChain(
    chain: ChainConfig,
    settlement: CrossChainSettlement
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${chain.endpoint}/api/v1/settlements`,
        {
          ...settlement,
          crossChain: true,
          originChain: this.config.chainId,
        },
        { timeout: 30000 }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to submit settlement to chain', {
        chainId: chain.chainId,
        settlementId: settlement.id,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Calculate semantic match between intents (simplified)
   */
  private calculateSemanticMatch(intentA: Intent, intentB: Intent): number {
    // Simple keyword overlap
    const wordsA = new Set(intentA.prose.toLowerCase().split(/\s+/));
    const wordsB = new Set(intentB.prose.toLowerCase().split(/\s+/));

    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }

    return overlap / Math.max(wordsA.size, wordsB.size);
  }
}
