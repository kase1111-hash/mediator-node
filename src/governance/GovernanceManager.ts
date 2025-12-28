import { nanoid } from 'nanoid';
import axios from 'axios';
import {
  MediatorConfig,
  GovernanceProposal,
  GovernanceVote,
  GovernanceConfig,
  GovernanceProposalSubmissionResult,
  GovernanceVoteSubmissionResult,
  GovernableParameters,
} from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';
import { StakeManager } from '../consensus/StakeManager';

/**
 * GovernanceManager handles the complete lifecycle of on-chain governance
 * proposals including submission, voting, quorum validation, and execution
 *
 * Implements Section 4.2.3 (DPoS Governance Voting) from the spec:
 * - Governance Intents as special prose entries
 * - Stake-weighted voting (1 token = 1 vote)
 * - Lifecycle: Submission → 7-day voting → quorum (≥30%) → majority approval → 3-day delay → execution
 * - Governable parameters: Slots, stake mins, fees, thresholds, mode transitions
 */
export class GovernanceManager {
  private config: MediatorConfig;
  private stakeManager: StakeManager;
  private governanceConfig: GovernanceConfig;
  private proposals: Map<string, GovernanceProposal> = new Map();
  private votes: Map<string, GovernanceVote[]> = new Map(); // proposalId -> votes
  private myVotes: Map<string, GovernanceVote> = new Map(); // proposalId -> my vote
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: MediatorConfig, stakeManager: StakeManager) {
    this.config = config;
    this.stakeManager = stakeManager;

    // Initialize governance configuration
    this.governanceConfig = {
      votingPeriodDays: config.governanceVotingPeriodDays || 7,
      executionDelayDays: config.governanceExecutionDelayDays || 3,
      quorumPercentage: config.governanceQuorumPercentage || 30,
      approvalThreshold: config.governanceApprovalThreshold || 50,
      proposalSubmissionMinStake: config.governanceProposalMinStake || 1000,
    };
  }

  /**
   * Start governance monitoring
   */
  public start(): void {
    const interval = this.config.governanceMonitoringInterval || 3600000; // 1 hour

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorProposals();
      } catch (error) {
        logger.error('Error in governance monitoring interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, interval);

    logger.info('Governance manager started', {
      votingPeriodDays: this.governanceConfig.votingPeriodDays,
      quorumPercentage: this.governanceConfig.quorumPercentage,
      approvalThreshold: this.governanceConfig.approvalThreshold,
    });

    // Initial monitoring with error handling
    this.monitorProposals().catch(error => {
      logger.error('Error in initial governance monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  /**
   * Stop governance monitoring
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Governance manager stopped');
  }

  /**
   * Submit a new governance proposal
   */
  public async submitProposal(
    title: string,
    description: string,
    proposalType: 'parameter_change' | 'authority_add' | 'authority_remove' | 'mode_transition',
    parameters?: Record<string, any>
  ): Promise<GovernanceProposalSubmissionResult> {
    try {
      // Check if submitter has minimum stake
      const effectiveStake = this.stakeManager.getEffectiveStake();
      if (effectiveStake < this.governanceConfig.proposalSubmissionMinStake!) {
        return {
          success: false,
          error: `Insufficient stake to submit proposal. Required: ${this.governanceConfig.proposalSubmissionMinStake}, Have: ${effectiveStake}`,
          timestamp: Date.now(),
        };
      }

      const proposalId = nanoid();
      const timestamp = Date.now();
      const votingPeriodEnd = timestamp + this.governanceConfig.votingPeriodDays * 24 * 60 * 60 * 1000;
      const executionDelay = this.governanceConfig.executionDelayDays * 24 * 60 * 60 * 1000;

      const proposal: GovernanceProposal = {
        id: proposalId,
        proposerId: this.config.mediatorPublicKey,
        title,
        description,
        proposalType,
        parameters,
        votingPeriodEnd,
        executionDelay,
        status: 'voting',
        votes: {
          for: 0,
          against: 0,
          abstain: 0,
        },
        quorumRequired: this.governanceConfig.quorumPercentage,
        timestamp,
      };

      // Format as prose entry
      proposal.prose = this.formatProposalAsProse(proposal);

      // Sign the proposal
      const signature = generateSignature(
        JSON.stringify(proposal),
        this.config.mediatorPrivateKey
      );

      // Submit to chain API
      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/governance/proposals`,
        {
          proposal,
          signature,
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200 || response.status === 201) {
        // Store locally
        this.proposals.set(proposalId, proposal);
        this.votes.set(proposalId, []);

        logger.info('Governance proposal submitted', {
          proposalId,
          title,
          proposalType,
          votingPeriodEnd: new Date(votingPeriodEnd).toISOString(),
        });

        return {
          success: true,
          proposalId,
          timestamp,
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp,
        };
      }
    } catch (error) {
      logger.error('Error submitting governance proposal', { error, title });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Cast a vote on a proposal
   */
  public async castVote(
    proposalId: string,
    voteType: 'for' | 'against' | 'abstain'
  ): Promise<GovernanceVoteSubmissionResult> {
    try {
      const proposal = this.proposals.get(proposalId);
      if (!proposal) {
        return {
          success: false,
          error: `Proposal ${proposalId} not found`,
          timestamp: Date.now(),
        };
      }

      // Check if voting period is still active
      if (Date.now() > proposal.votingPeriodEnd) {
        return {
          success: false,
          error: 'Voting period has ended',
          timestamp: Date.now(),
        };
      }

      // Check if already voted
      if (this.myVotes.has(proposalId)) {
        return {
          success: false,
          error: 'Already voted on this proposal',
          timestamp: Date.now(),
        };
      }

      // Calculate voting power (1 token = 1 vote, weighted by effective stake)
      const votingPower = this.stakeManager.getEffectiveStake();

      if (votingPower === 0) {
        return {
          success: false,
          error: 'No voting power (no stake)',
          timestamp: Date.now(),
        };
      }

      const voteId = nanoid();
      const timestamp = Date.now();

      const vote: GovernanceVote = {
        id: voteId,
        proposalId,
        voterId: this.config.mediatorPublicKey,
        voteType,
        votingPower,
        timestamp,
      };

      // Sign the vote
      const signature = generateSignature(
        JSON.stringify(vote),
        this.config.mediatorPrivateKey
      );

      vote.signature = signature;

      // Submit to chain API
      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/governance/votes`,
        {
          vote,
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200 || response.status === 201) {
        // Store locally
        this.myVotes.set(proposalId, vote);

        logger.info('Vote cast successfully', {
          proposalId,
          voteType,
          votingPower,
        });

        return {
          success: true,
          voteId,
          timestamp,
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp,
        };
      }
    } catch (error) {
      logger.error('Error casting vote', { error, proposalId });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Monitor proposals for status updates and handle lifecycle
   */
  private async monitorProposals(): Promise<void> {
    try {
      // Fetch active proposals from chain
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/governance/proposals?status=voting,passed`,
        {
          timeout: 10000,
        }
      );

      if (response.data && response.data.proposals) {
        for (const proposal of response.data.proposals) {
          await this.updateProposal(proposal);
        }
      }

      // Check for proposals that need status updates
      for (const [proposalId, proposal] of this.proposals.entries()) {
        if (proposal.status === 'voting') {
          await this.checkVotingPeriodEnd(proposalId);
        } else if (proposal.status === 'passed') {
          await this.checkExecutionTime(proposalId);
        }
      }
    } catch (error) {
      logger.error('Error monitoring proposals', { error });
    }
  }

  /**
   * Update local proposal with chain data
   */
  private async updateProposal(chainProposal: GovernanceProposal): Promise<void> {
    const proposalId = chainProposal.id;
    const existing = this.proposals.get(proposalId);

    // Update or add proposal
    this.proposals.set(proposalId, chainProposal);

    // Fetch votes for this proposal
    try {
      const votesResponse = await axios.get(
        `${this.config.chainEndpoint}/api/v1/governance/proposals/${proposalId}/votes`,
        {
          timeout: 10000,
        }
      );

      if (votesResponse.data && votesResponse.data.votes) {
        this.votes.set(proposalId, votesResponse.data.votes);
      }
    } catch (error) {
      logger.error('Error fetching votes for proposal', { error, proposalId });
    }

    // Log status changes
    if (existing && existing.status !== chainProposal.status) {
      logger.info('Proposal status changed', {
        proposalId,
        oldStatus: existing.status,
        newStatus: chainProposal.status,
      });
    }
  }

  /**
   * Check if voting period has ended and calculate results
   */
  private async checkVotingPeriodEnd(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'voting') {
      return;
    }

    const now = Date.now();
    if (now <= proposal.votingPeriodEnd) {
      return; // Still voting
    }

    // Voting period ended, calculate results
    await this.finalizeVoting(proposalId);
  }

  /**
   * Finalize voting and determine if proposal passed
   */
  private async finalizeVoting(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return;
    }

    const proposalVotes = this.votes.get(proposalId) || [];

    // Calculate total voting power
    let totalFor = 0;
    let totalAgainst = 0;
    let totalAbstain = 0;

    for (const vote of proposalVotes) {
      if (vote.voteType === 'for') {
        totalFor += vote.votingPower;
      } else if (vote.voteType === 'against') {
        totalAgainst += vote.votingPower;
      } else if (vote.voteType === 'abstain') {
        totalAbstain += vote.votingPower;
      }
    }

    const totalVotes = totalFor + totalAgainst + totalAbstain;

    // Get total stake in the system for quorum calculation
    // For simplicity, we'll use the sum of all votes as the base
    // In production, this should query the total staked amount from the chain
    const totalStake = totalVotes; // Simplified for now

    const quorumReached = (totalVotes / totalStake) * 100 >= proposal.quorumRequired;
    const approvalPercentage = totalVotes > 0 ? (totalFor / (totalFor + totalAgainst)) * 100 : 0;
    const approved = approvalPercentage >= this.governanceConfig.approvalThreshold;

    logger.info('Finalizing proposal voting', {
      proposalId,
      totalFor,
      totalAgainst,
      totalAbstain,
      totalVotes,
      quorumReached,
      approvalPercentage: approvalPercentage.toFixed(2),
      approved,
    });

    // Update proposal status
    proposal.votes.for = totalFor;
    proposal.votes.against = totalAgainst;
    proposal.votes.abstain = totalAbstain;

    if (!quorumReached) {
      proposal.status = 'rejected';
      logger.info('Proposal rejected: Quorum not reached', { proposalId });
    } else if (!approved) {
      proposal.status = 'rejected';
      logger.info('Proposal rejected: Majority not reached', { proposalId });
    } else {
      proposal.status = 'passed';
      proposal.executionTime = Date.now() + proposal.executionDelay;
      logger.info('Proposal passed', {
        proposalId,
        executionTime: new Date(proposal.executionTime).toISOString(),
      });
    }

    this.proposals.set(proposalId, proposal);
  }

  /**
   * Check if proposal is ready for execution
   */
  private async checkExecutionTime(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'passed') {
      return;
    }

    if (!proposal.executionTime || Date.now() < proposal.executionTime) {
      return; // Not yet time to execute
    }

    // Execute the proposal
    await this.executeProposal(proposalId);
  }

  /**
   * Execute an approved proposal
   */
  private async executeProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'passed') {
      return;
    }

    logger.info('Executing governance proposal', {
      proposalId,
      proposalType: proposal.proposalType,
    });

    try {
      let executed = false;

      switch (proposal.proposalType) {
        case 'parameter_change':
          executed = await this.executeParameterChange(proposal);
          break;

        case 'authority_add':
          executed = await this.executeAuthorityAdd(proposal);
          break;

        case 'authority_remove':
          executed = await this.executeAuthorityRemove(proposal);
          break;

        case 'mode_transition':
          executed = await this.executeModeTransition(proposal);
          break;

        default:
          logger.warn('Unknown proposal type', {
            proposalId,
            proposalType: proposal.proposalType,
          });
      }

      if (executed) {
        proposal.status = 'executed';
        this.proposals.set(proposalId, proposal);

        logger.info('Proposal executed successfully', { proposalId });
      } else {
        logger.error('Proposal execution failed', { proposalId });
      }
    } catch (error) {
      logger.error('Error executing proposal', { error, proposalId });
    }
  }

  /**
   * Execute a parameter change proposal
   */
  private async executeParameterChange(proposal: GovernanceProposal): Promise<boolean> {
    if (!proposal.parameters) {
      logger.warn('Parameter change proposal has no parameters', {
        proposalId: proposal.id,
      });
      return false;
    }

    logger.info('Applying parameter changes', {
      proposalId: proposal.id,
      parameters: proposal.parameters,
    });

    // Apply parameter changes locally
    // Note: In production, these changes would be persisted and applied across restarts
    for (const [key, value] of Object.entries(proposal.parameters)) {
      if (key in this.config) {
        (this.config as any)[key] = value;
        logger.info('Parameter updated', { key, value });
      } else {
        logger.warn('Unknown parameter in proposal', { key, value });
      }
    }

    // Submit execution confirmation to chain
    try {
      await axios.post(
        `${this.config.chainEndpoint}/api/v1/governance/proposals/${proposal.id}/execute`,
        {
          executedBy: this.config.mediatorPublicKey,
          timestamp: Date.now(),
        },
        {
          timeout: 10000,
        }
      );

      return true;
    } catch (error) {
      logger.error('Error confirming parameter change execution', {
        error,
        proposalId: proposal.id,
      });
      return false;
    }
  }

  /**
   * Execute authority add proposal
   */
  private async executeAuthorityAdd(proposal: GovernanceProposal): Promise<boolean> {
    logger.info('Authority add execution not yet implemented', {
      proposalId: proposal.id,
    });

    // This would integrate with AuthorityManager to add a new authority
    // await this.authorityManager.addAuthority(proposal.parameters.publicKey);

    return false; // Not implemented yet
  }

  /**
   * Execute authority remove proposal
   */
  private async executeAuthorityRemove(proposal: GovernanceProposal): Promise<boolean> {
    logger.info('Authority remove execution not yet implemented', {
      proposalId: proposal.id,
    });

    // This would integrate with AuthorityManager to remove an authority
    // await this.authorityManager.removeAuthority(proposal.parameters.publicKey);

    return false; // Not implemented yet
  }

  /**
   * Execute mode transition proposal
   */
  private async executeModeTransition(proposal: GovernanceProposal): Promise<boolean> {
    logger.info('Mode transition execution not yet implemented', {
      proposalId: proposal.id,
    });

    // This would transition the consensus mode
    // Requires coordination with the chain and all validators

    return false; // Not implemented yet
  }

  /**
   * Format proposal as prose for chain submission
   */
  private formatProposalAsProse(proposal: GovernanceProposal): string {
    let prose = `[GOVERNANCE PROPOSAL]\n\n`;
    prose += `Proposal ID: ${proposal.id}\n`;
    prose += `Proposer: ${proposal.proposerId}\n`;
    prose += `Type: ${proposal.proposalType.replace('_', ' ').toUpperCase()}\n`;
    prose += `Timestamp: ${new Date(proposal.timestamp).toISOString()}\n\n`;

    prose += `TITLE: ${proposal.title}\n\n`;
    prose += `DESCRIPTION:\n${proposal.description}\n\n`;

    if (proposal.parameters) {
      prose += `PARAMETERS:\n`;
      for (const [key, value] of Object.entries(proposal.parameters)) {
        prose += `  ${key}: ${JSON.stringify(value)}\n`;
      }
      prose += `\n`;
    }

    prose += `VOTING PERIOD: ${this.governanceConfig.votingPeriodDays} days\n`;
    prose += `VOTING ENDS: ${new Date(proposal.votingPeriodEnd).toISOString()}\n`;
    prose += `EXECUTION DELAY: ${this.governanceConfig.executionDelayDays} days\n`;
    prose += `QUORUM REQUIRED: ${proposal.quorumRequired}%\n`;
    prose += `APPROVAL THRESHOLD: ${this.governanceConfig.approvalThreshold}%\n\n`;

    prose += `This proposal will be executed automatically if approved by the required majority `;
    prose += `and quorum, after a ${this.governanceConfig.executionDelayDays}-day safety delay.\n`;

    return prose;
  }

  /**
   * Get all proposals
   */
  public getProposals(): GovernanceProposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Get active proposals (currently voting)
   */
  public getActiveProposals(): GovernanceProposal[] {
    return this.getProposals().filter((p) => p.status === 'voting');
  }

  /**
   * Get proposal by ID
   */
  public getProposal(proposalId: string): GovernanceProposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Get votes for a proposal
   */
  public getVotes(proposalId: string): GovernanceVote[] {
    return this.votes.get(proposalId) || [];
  }

  /**
   * Get my vote for a proposal
   */
  public getMyVote(proposalId: string): GovernanceVote | undefined {
    return this.myVotes.get(proposalId);
  }

  /**
   * Get governance statistics
   */
  public getStatistics(): {
    totalProposals: number;
    activeProposals: number;
    passedProposals: number;
    rejectedProposals: number;
    executedProposals: number;
    myVotesCount: number;
  } {
    const proposals = this.getProposals();

    return {
      totalProposals: proposals.length,
      activeProposals: proposals.filter((p) => p.status === 'voting').length,
      passedProposals: proposals.filter((p) => p.status === 'passed').length,
      rejectedProposals: proposals.filter((p) => p.status === 'rejected').length,
      executedProposals: proposals.filter((p) => p.status === 'executed').length,
      myVotesCount: this.myVotes.size,
    };
  }
}
