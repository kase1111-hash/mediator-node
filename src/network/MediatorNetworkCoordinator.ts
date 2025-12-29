/**
 * Distributed Mediator Network Coordinator
 *
 * Enables peer discovery, coordination, and load distribution
 * among multiple mediator nodes for horizontal scaling.
 */

import axios from 'axios';
import { randomBytes, randomInt } from 'crypto';
import { EventEmitter } from 'events';
import { MediatorConfig, ProposedSettlement } from '../types';
import { logger } from '../utils/logger';

/**
 * Peer mediator node information
 */
export interface PeerMediator {
  peerId: string;
  publicKey: string;
  endpoint: string; // HTTP endpoint for peer communication
  websocketEndpoint?: string;
  lastSeen: number;
  reputation: number;
  activeSettlements: number;
  capabilities: string[]; // e.g., ['semantic_consensus', 'high_value', 'fast_track']
  load: number; // 0-100 load percentage
  version: string;
}

/**
 * Coordination message types
 */
export type CoordinationMessageType =
  | 'peer_announce' // Announce presence to network
  | 'peer_heartbeat' // Periodic health check
  | 'work_claim' // Claim work on an intent pair
  | 'work_release' // Release claimed work
  | 'settlement_broadcast' // Broadcast new settlement
  | 'consensus_request' // Request semantic consensus participation
  | 'consensus_response' // Response to consensus request
  | 'load_report'; // Report current load

export interface CoordinationMessage {
  type: CoordinationMessageType;
  from: string; // Peer ID
  timestamp: number;
  payload: any;
  signature?: string;
}

/**
 * Work claim for preventing duplicate mediations
 */
export interface WorkClaim {
  claimId: string;
  mediatorId: string;
  intentHashA: string;
  intentHashB: string;
  claimedAt: number;
  expiresAt: number;
}

/**
 * MediatorNetworkCoordinator manages peer discovery and coordination
 *
 * Features:
 * - Peer discovery via gossip protocol
 * - Work claim system to prevent duplicate efforts
 * - Load-based work distribution
 * - Distributed semantic consensus
 * - Network-wide settlement broadcasting
 */
export class MediatorNetworkCoordinator extends EventEmitter {
  private config: MediatorConfig;
  private peers: Map<string, PeerMediator> = new Map();
  private workClaims: Map<string, WorkClaim> = new Map(); // claimKey -> claim
  private myLoad: number = 0;

  private heartbeatInterval?: NodeJS.Timeout;
  private discoveryInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly DISCOVERY_INTERVAL = 60000; // 1 minute
  private readonly PEER_TIMEOUT = 120000; // 2 minutes
  private readonly WORK_CLAIM_TTL = 300000; // 5 minutes

  constructor(config: MediatorConfig) {
    super();
    this.config = config;
  }

  /**
   * Start coordinator
   */
  public async start(): Promise<void> {
    logger.info('Starting distributed mediator coordinator', {
      peerId: this.config.mediatorPublicKey,
      coordinationEndpoints: this.config.coordinationEndpoints || [],
    });

    // Announce presence to network
    await this.announceSelf();

    // Start periodic tasks
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_INTERVAL);
    this.discoveryInterval = setInterval(() => this.discoverPeers(), this.DISCOVERY_INTERVAL);
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);

    // Initial peer discovery
    await this.discoverPeers();

    logger.info('Distributed coordinator started', {
      knownPeers: this.peers.size,
    });
  }

  /**
   * Stop coordinator
   */
  public stop(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    logger.info('Distributed coordinator stopped');
  }

  /**
   * Attempt to claim work on an intent pair
   *
   * @returns true if claim successful, false if already claimed
   */
  public async claimWork(intentHashA: string, intentHashB: string): Promise<boolean> {
    const claimKey = this.getClaimKey(intentHashA, intentHashB);

    // Check if already claimed
    const existingClaim = this.workClaims.get(claimKey);
    if (existingClaim && existingClaim.expiresAt > Date.now()) {
      logger.debug('Work already claimed by another mediator', {
        intentA: intentHashA,
        intentB: intentHashB,
        claimedBy: existingClaim.mediatorId,
      });
      return false;
    }

    // Create claim
    const claim: WorkClaim = {
      claimId: `claim_${Date.now()}_${randomBytes(6).toString('hex')}`,
      mediatorId: this.config.mediatorPublicKey!,
      intentHashA,
      intentHashB,
      claimedAt: Date.now(),
      expiresAt: Date.now() + this.WORK_CLAIM_TTL,
    };

    this.workClaims.set(claimKey, claim);

    // Broadcast claim to network
    await this.broadcastMessage({
      type: 'work_claim',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: claim,
    });

    logger.debug('Work claimed successfully', {
      claimId: claim.claimId,
      intentA: intentHashA,
      intentB: intentHashB,
    });

    return true;
  }

  /**
   * Release work claim
   */
  public async releaseWork(intentHashA: string, intentHashB: string): Promise<void> {
    const claimKey = this.getClaimKey(intentHashA, intentHashB);
    this.workClaims.delete(claimKey);

    await this.broadcastMessage({
      type: 'work_release',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: { intentHashA, intentHashB },
    });
  }

  /**
   * Broadcast settlement to network
   */
  public async broadcastSettlement(settlement: ProposedSettlement): Promise<void> {
    await this.broadcastMessage({
      type: 'settlement_broadcast',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: settlement,
    });

    logger.info('Settlement broadcasted to network', {
      settlementId: settlement.id,
      peers: this.peers.size,
    });
  }

  /**
   * Request semantic consensus from peers
   *
   * @param settlement - Settlement to validate
   * @param required - Number of confirmations required
   * @returns Array of peer responses
   */
  public async requestConsensus(
    settlement: ProposedSettlement,
    required: number = 3
  ): Promise<{ peerId: string; summary: string; approved: boolean }[]> {
    const responses: { peerId: string; summary: string; approved: boolean }[] = [];

    // Select random peers with semantic_consensus capability
    const eligiblePeers = Array.from(this.peers.values()).filter((peer) =>
      peer.capabilities.includes('semantic_consensus')
    );

    // Shuffle and select
    const selectedPeers = this.shuffleArray(eligiblePeers).slice(0, required * 2); // Request from 2x peers

    const message: CoordinationMessage = {
      type: 'consensus_request',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: { settlement, requester: this.config.mediatorPublicKey },
    };

    // Send requests in parallel
    const requests = selectedPeers.map(async (peer) => {
      try {
        const response = await axios.post(
          `${peer.endpoint}/api/coordination/consensus`,
          message,
          { timeout: 30000 }
        );

        return {
          peerId: peer.peerId,
          summary: response.data.summary,
          approved: response.data.approved,
        };
      } catch (error: any) {
        logger.warn('Consensus request failed', {
          peerId: peer.peerId,
          error: error.message,
        });
        return null;
      }
    });

    const results = await Promise.all(requests);

    return results.filter((r) => r !== null) as {
      peerId: string;
      summary: string;
      approved: boolean;
    }[];
  }

  /**
   * Update current load
   */
  public updateLoad(load: number): void {
    this.myLoad = Math.max(0, Math.min(100, load));
  }

  /**
   * Get load-balanced peer for delegation
   *
   * @returns Least loaded peer, or null if none available
   */
  public getLeastLoadedPeer(): PeerMediator | null {
    if (this.peers.size === 0) return null;

    let bestPeer: PeerMediator | null = null;
    let lowestLoad = 100;

    for (const peer of this.peers.values()) {
      if (peer.load < lowestLoad && Date.now() - peer.lastSeen < this.PEER_TIMEOUT) {
        lowestLoad = peer.load;
        bestPeer = peer;
      }
    }

    return bestPeer;
  }

  /**
   * Get network statistics
   */
  public getNetworkStats(): {
    totalPeers: number;
    activePeers: number;
    averageLoad: number;
    totalWorkClaims: number;
    myLoad: number;
  } {
    const now = Date.now();
    const activePeers = Array.from(this.peers.values()).filter(
      (peer) => now - peer.lastSeen < this.PEER_TIMEOUT
    );

    const averageLoad =
      activePeers.reduce((sum, peer) => sum + peer.load, 0) / (activePeers.length || 1);

    return {
      totalPeers: this.peers.size,
      activePeers: activePeers.length,
      averageLoad,
      totalWorkClaims: this.workClaims.size,
      myLoad: this.myLoad,
    };
  }

  /**
   * Announce self to network
   */
  private async announceSelf(): Promise<void> {
    const announcement: PeerMediator = {
      peerId: this.config.mediatorPublicKey!,
      publicKey: this.config.mediatorPublicKey!,
      endpoint: this.config.httpEndpoint || `http://localhost:${this.config.port || 3000}`,
      websocketEndpoint: this.config.webSocketEndpoint,
      lastSeen: Date.now(),
      reputation: 1.0,
      activeSettlements: 0,
      capabilities: ['semantic_consensus', 'fast_track'],
      load: this.myLoad,
      version: '1.0.0',
    };

    await this.broadcastMessage({
      type: 'peer_announce',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: announcement,
    });
  }

  /**
   * Send periodic heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    await this.broadcastMessage({
      type: 'peer_heartbeat',
      from: this.config.mediatorPublicKey!,
      timestamp: Date.now(),
      payload: {
        load: this.myLoad,
        activeSettlements: 0, // TODO: Get from settlement manager
      },
    });
  }

  /**
   * Discover peers via coordination endpoints
   */
  private async discoverPeers(): Promise<void> {
    const endpoints = this.config.coordinationEndpoints || [];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${endpoint}/api/coordination/peers`, {
          timeout: 5000,
        });

        const peers: PeerMediator[] = response.data.peers || [];

        for (const peer of peers) {
          if (peer.peerId !== this.config.mediatorPublicKey) {
            this.peers.set(peer.peerId, { ...peer, lastSeen: Date.now() });
          }
        }

        logger.debug('Peer discovery completed', {
          endpoint,
          discoveredPeers: peers.length,
          totalKnownPeers: this.peers.size,
        });
      } catch (error: any) {
        logger.warn('Peer discovery failed', {
          endpoint,
          error: error.message,
        });
      }
    }
  }

  /**
   * Broadcast message to all peers
   */
  private async broadcastMessage(message: CoordinationMessage): Promise<void> {
    const peers = Array.from(this.peers.values());

    const broadcasts = peers.map(async (peer) => {
      try {
        await axios.post(`${peer.endpoint}/api/coordination/message`, message, {
          timeout: 5000,
        });
      } catch (error) {
        // Ignore individual broadcast failures
      }
    });

    await Promise.allSettled(broadcasts);
  }

  /**
   * Clean up stale peers and work claims
   */
  private cleanup(): void {
    const now = Date.now();

    // Remove stale peers
    for (const [peerId, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > this.PEER_TIMEOUT) {
        this.peers.delete(peerId);
        logger.debug('Removed stale peer', { peerId });
      }
    }

    // Remove expired work claims
    for (const [claimKey, claim] of this.workClaims.entries()) {
      if (now > claim.expiresAt) {
        this.workClaims.delete(claimKey);
      }
    }
  }

  /**
   * Generate claim key from intent hashes
   */
  private getClaimKey(intentHashA: string, intentHashB: string): string {
    return [intentHashA, intentHashB].sort().join('::');
  }

  /**
   * Shuffle array (Fisher-Yates) using cryptographically secure randomness
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
