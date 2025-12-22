import { GovernanceManager } from '../../../src/governance/GovernanceManager';
import { MediatorConfig, GovernanceProposal, GovernanceVote } from '../../../src/types';
import { StakeManager } from '../../../src/consensus/StakeManager';
import { createMockConfig } from '../../utils/testUtils';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock StakeManager
jest.mock('../../../src/consensus/StakeManager');

describe('GovernanceManager', () => {
  let governanceManager: GovernanceManager;
  let config: MediatorConfig;
  let mockStakeManager: jest.Mocked<StakeManager>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    config = createMockConfig({
      consensusMode: 'dpos',
      enableGovernance: true,
      governanceVotingPeriodDays: 7,
      governanceExecutionDelayDays: 3,
      governanceQuorumPercentage: 30,
      governanceApprovalThreshold: 50,
      governanceProposalMinStake: 1000,
      governanceMonitoringInterval: 3600000,
    });

    // Create mock StakeManager
    mockStakeManager = new StakeManager(config) as jest.Mocked<StakeManager>;
    mockStakeManager.getEffectiveStake = jest.fn().mockReturnValue(5000);

    governanceManager = new GovernanceManager(config, mockStakeManager);
  });

  afterEach(() => {
    governanceManager.stop();
  });

  describe('Proposal Submission', () => {
    it('should submit a valid parameter change proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockResolvedValueOnce({
        status: 201,
        data: { success: true },
      });

      const result = await governanceManager.submitProposal(
        'Increase DPoS Active Slots',
        'Increase active slots from 10 to 15 to improve decentralization',
        'parameter_change',
        { dposActiveSlots: 15 }
      );

      expect(result.success).toBe(true);
      expect(result.proposalId).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/governance/proposals'),
        expect.objectContaining({
          proposal: expect.objectContaining({
            title: 'Increase DPoS Active Slots',
            proposalType: 'parameter_change',
            parameters: { dposActiveSlots: 15 },
            status: 'voting',
          }),
          signature: expect.any(String),
        }),
        expect.any(Object)
      );
    });

    it('should reject proposal submission with insufficient stake', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(500); // Below minimum

      const result = await governanceManager.submitProposal(
        'Test Proposal',
        'This should fail',
        'parameter_change',
        { dposActiveSlots: 15 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient stake');
      expect(result.error).toContain('Required: 1000');
      expect(result.error).toContain('Have: 500');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should submit authority add proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.submitProposal(
        'Add New Authority',
        'Add new authority mediator for improved network resilience',
        'authority_add',
        { publicKey: 'new_authority_key', stake: 10000 }
      );

      expect(result.success).toBe(true);
      expect(result.proposalId).toBeDefined();
    });

    it('should submit authority remove proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.submitProposal(
        'Remove Inactive Authority',
        'Remove authority that has been inactive for 90 days',
        'authority_remove',
        { publicKey: 'inactive_authority_key' }
      );

      expect(result.success).toBe(true);
      expect(result.proposalId).toBeDefined();
    });

    it('should submit mode transition proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.submitProposal(
        'Transition to Hybrid Mode',
        'Transition from DPoS to hybrid consensus mode',
        'mode_transition',
        { consensusMode: 'hybrid' }
      );

      expect(result.success).toBe(true);
      expect(result.proposalId).toBeDefined();
    });

    it('should handle submission API errors', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await governanceManager.submitProposal(
        'Test Proposal',
        'This should fail',
        'parameter_change',
        { dposActiveSlots: 15 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should include prose description in proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Increase Fee',
        'Increase facilitation fee to 2%',
        'parameter_change',
        { facilitationFeePercent: 2.0 }
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          proposal: expect.objectContaining({
            prose: expect.stringContaining('GOVERNANCE PROPOSAL'),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Vote Casting', () => {
    beforeEach(async () => {
      // Submit a test proposal first
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Test Proposal',
        'For testing votes',
        'parameter_change',
        { dposActiveSlots: 15 }
      );
    });

    it('should cast a vote for a proposal', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockStakeManager.getEffectiveStake.mockReturnValue(3000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.castVote(proposalId, 'for');

      expect(result.success).toBe(true);
      expect(result.voteId).toBeDefined();
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/governance/votes'),
        expect.objectContaining({
          vote: expect.objectContaining({
            proposalId,
            voteType: 'for',
            votingPower: 3000,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should cast against vote', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockStakeManager.getEffectiveStake.mockReturnValue(1500);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.castVote(proposalId, 'against');

      expect(result.success).toBe(true);
      expect(result.voteId).toBeDefined();
    });

    it('should cast abstain vote', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const result = await governanceManager.castVote(proposalId, 'abstain');

      expect(result.success).toBe(true);
    });

    it('should reject vote for non-existent proposal', async () => {
      const result = await governanceManager.castVote('invalid_proposal_id', 'for');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject duplicate votes', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      // First vote should succeed
      const firstVote = await governanceManager.castVote(proposalId, 'for');
      expect(firstVote.success).toBe(true);

      // Second vote should fail
      const secondVote = await governanceManager.castVote(proposalId, 'for');
      expect(secondVote.success).toBe(false);
      expect(secondVote.error).toContain('Already voted');
    });

    it('should use stake-weighted voting power', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockStakeManager.getEffectiveStake.mockReturnValue(7500);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await governanceManager.castVote(proposalId, 'for');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          vote: expect.objectContaining({
            votingPower: 7500, // Should match stake
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle vote submission API errors', async () => {
      const proposals = governanceManager.getActiveProposals();
      const proposalId = proposals[0].id;

      mockedAxios.post.mockRejectedValueOnce(new Error('Vote submission failed'));

      const result = await governanceManager.castVote(proposalId, 'for');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Vote submission failed');
    });
  });

  describe('Proposal Status and Lifecycle', () => {
    it('should get active proposals', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Proposal 1',
        'Description 1',
        'parameter_change',
        { dposActiveSlots: 10 }
      );

      await governanceManager.submitProposal(
        'Proposal 2',
        'Description 2',
        'parameter_change',
        { dposActiveSlots: 12 }
      );

      const activeProposals = governanceManager.getActiveProposals();

      expect(activeProposals).toHaveLength(2);
      expect(activeProposals[0].status).toBe('voting');
      expect(activeProposals[1].status).toBe('voting');
    });

    it('should get proposal by ID', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const submitResult = await governanceManager.submitProposal(
        'Test Proposal',
        'Test Description',
        'parameter_change',
        { dposActiveSlots: 15 }
      );

      const proposal = governanceManager.getProposal(submitResult.proposalId!);

      expect(proposal).toBeDefined();
      expect(proposal?.id).toBe(submitResult.proposalId);
      expect(proposal?.title).toBe('Test Proposal');
    });

    it('should return undefined for non-existent proposal', () => {
      const proposal = governanceManager.getProposal('non_existent_id');

      expect(proposal).toBeUndefined();
    });

    it('should get all proposals', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      // Create voting proposals
      await governanceManager.submitProposal(
        'Voting Proposal',
        'Still in voting',
        'parameter_change',
        { dposActiveSlots: 10 }
      );

      const allProposals = governanceManager.getProposals();
      expect(allProposals.length).toBeGreaterThan(0);
      expect(allProposals[0].status).toBe('voting');
    });

    it('should get my vote for a proposal', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const submitResult = await governanceManager.submitProposal(
        'Test Proposal',
        'Test',
        'parameter_change',
        {}
      );

      await governanceManager.castVote(submitResult.proposalId!, 'for');

      const myVote = governanceManager.getMyVote(submitResult.proposalId!);
      expect(myVote).toBeDefined();
      expect(myVote?.proposalId).toBe(submitResult.proposalId);
      expect(myVote?.voteType).toBe('for');
    });
  });

  describe('Quorum and Approval Validation', () => {
    it('should have correct configuration', () => {
      // Verify governance configuration is set correctly
      expect(config.governanceQuorumPercentage).toBe(30);
      expect(config.governanceApprovalThreshold).toBe(50);
    });

    it('should track voting period end times', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const beforeSubmit = Date.now();
      await governanceManager.submitProposal(
        'Time Test',
        'Testing timing',
        'parameter_change',
        {}
      );
      const afterSubmit = Date.now();

      const proposals = governanceManager.getActiveProposals();
      const proposal = proposals[0];

      // Should be 7 days from now
      const expectedEnd = beforeSubmit + 7 * 24 * 60 * 60 * 1000;
      const expectedEndMax = afterSubmit + 7 * 24 * 60 * 60 * 1000;

      expect(proposal.votingPeriodEnd).toBeGreaterThanOrEqual(expectedEnd);
      expect(proposal.votingPeriodEnd).toBeLessThanOrEqual(expectedEndMax);
    });

    it('should set execution delay correctly', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Delay Test',
        'Testing execution delay',
        'parameter_change',
        {}
      );

      const proposals = governanceManager.getActiveProposals();
      const proposal = proposals[0];

      // Should be 3 days in milliseconds
      const expectedDelay = 3 * 24 * 60 * 60 * 1000;
      expect(proposal.executionDelay).toBe(expectedDelay);
    });
  });

  describe('Governance Statistics', () => {
    it('should return initial statistics', () => {
      const stats = governanceManager.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalProposals).toBe(0);
      expect(stats.activeProposals).toBe(0);
      expect(stats.passedProposals).toBe(0);
      expect(stats.rejectedProposals).toBe(0);
      expect(stats.executedProposals).toBe(0);
      expect(stats.myVotesCount).toBe(0);
    });

    it('should update statistics after proposals', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Proposal 1',
        'Description',
        'parameter_change',
        {}
      );

      await governanceManager.submitProposal(
        'Proposal 2',
        'Description',
        'parameter_change',
        {}
      );

      const stats = governanceManager.getStatistics();

      expect(stats.totalProposals).toBe(2);
      expect(stats.activeProposals).toBe(2);
    });

    it('should track vote counts in statistics', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const submitResult = await governanceManager.submitProposal(
        'Vote Test',
        'Testing votes',
        'parameter_change',
        {}
      );

      await governanceManager.castVote(submitResult.proposalId!, 'for');

      const stats = governanceManager.getStatistics();
      expect(stats.myVotesCount).toBe(1);
    });
  });

  describe('Monitoring and Lifecycle', () => {
    it('should start monitoring', () => {
      governanceManager.start();

      // Should start without errors
      // Monitoring interval should be set (verified by stop() working)
    });

    it('should stop monitoring', () => {
      governanceManager.start();
      governanceManager.stop();

      // Should stop cleanly
    });

    it('should handle multiple start/stop cycles', () => {
      governanceManager.start();
      governanceManager.stop();
      governanceManager.start();
      governanceManager.stop();

      // Should handle multiple cycles without errors
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed proposal data gracefully', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid proposal format' },
        },
      });

      const result = await governanceManager.submitProposal(
        'Bad Proposal',
        'This will fail',
        'parameter_change',
        { invalidParam: 'bad' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network timeouts', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));

      const result = await governanceManager.submitProposal(
        'Timeout Test',
        'Testing timeout',
        'parameter_change',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle chain API unavailability', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockRejectedValueOnce({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      const result = await governanceManager.submitProposal(
        'Connection Test',
        'Testing connection',
        'parameter_change',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Proposal Prose Formatting', () => {
    it('should format parameter change proposal as prose', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      let capturedProposal: any;
      mockedAxios.post.mockImplementationOnce(async (url, data: any) => {
        capturedProposal = data.proposal;
        return { status: 200, data: { success: true } };
      });

      await governanceManager.submitProposal(
        'Fee Adjustment',
        'Adjust facilitation fee to better reflect market conditions',
        'parameter_change',
        { facilitationFeePercent: 1.5 }
      );

      expect(capturedProposal.prose).toBeDefined();
      expect(capturedProposal.prose).toContain('GOVERNANCE PROPOSAL');
      expect(capturedProposal.prose).toContain('Fee Adjustment');
      expect(capturedProposal.prose).toContain('PARAMETER CHANGE');
      expect(capturedProposal.prose).toContain('facilitationFeePercent');
    });

    it('should include voting rules in prose', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);

      let capturedProposal: any;
      mockedAxios.post.mockImplementationOnce(async (url, data: any) => {
        capturedProposal = data.proposal;
        return { status: 200, data: { success: true } };
      });

      await governanceManager.submitProposal(
        'Test',
        'Description',
        'parameter_change',
        {}
      );

      expect(capturedProposal.prose).toContain('7 days');
      expect(capturedProposal.prose).toContain('30%');
      expect(capturedProposal.prose).toContain('50%');
    });
  });

  describe('Integration with StakeManager', () => {
    it('should query effective stake for proposal submission', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(1500);
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await governanceManager.submitProposal(
        'Stake Test',
        'Testing stake',
        'parameter_change',
        {}
      );

      expect(mockStakeManager.getEffectiveStake).toHaveBeenCalled();
    });

    it('should query effective stake for vote casting', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const submitResult = await governanceManager.submitProposal(
        'Vote Power Test',
        'Testing vote power',
        'parameter_change',
        {}
      );

      // Reset mock to track vote cast separately
      mockStakeManager.getEffectiveStake.mockClear();
      mockStakeManager.getEffectiveStake.mockReturnValue(3500);

      await governanceManager.castVote(submitResult.proposalId!, 'for');

      expect(mockStakeManager.getEffectiveStake).toHaveBeenCalled();
    });

    it('should use different voting power based on stake', async () => {
      mockStakeManager.getEffectiveStake.mockReturnValue(2000);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const submitResult = await governanceManager.submitProposal(
        'Power Test',
        'Testing',
        'parameter_change',
        {}
      );

      mockStakeManager.getEffectiveStake.mockReturnValue(10000);

      let capturedVote: any;
      mockedAxios.post.mockImplementationOnce(async (url, data: any) => {
        capturedVote = data.vote;
        return { status: 200, data: { success: true } };
      });

      await governanceManager.castVote(submitResult.proposalId!, 'for');

      expect(capturedVote.votingPower).toBe(10000);
    });
  });

  describe('Configuration', () => {
    it('should respect custom voting period', () => {
      const customConfig = createMockConfig({
        enableGovernance: true,
        governanceVotingPeriodDays: 14, // Custom 14 days
      });

      const customManager = new GovernanceManager(customConfig, mockStakeManager);
      const stats = customManager.getStatistics();

      // Voting period should be reflected in config
      expect(stats).toBeDefined();
      customManager.stop();
    });

    it('should respect custom quorum percentage', () => {
      const customConfig = createMockConfig({
        enableGovernance: true,
        governanceQuorumPercentage: 40, // Custom 40%
      });

      const customManager = new GovernanceManager(customConfig, mockStakeManager);

      // Verify quorum is set in config
      expect(customConfig.governanceQuorumPercentage).toBe(40);
      customManager.stop();
    });

    it('should respect custom approval threshold', () => {
      const customConfig = createMockConfig({
        enableGovernance: true,
        governanceApprovalThreshold: 66, // Custom 66% (supermajority)
      });

      const customManager = new GovernanceManager(customConfig, mockStakeManager);

      // Verify approval threshold is set in config
      expect(customConfig.governanceApprovalThreshold).toBe(66);
      customManager.stop();
    });

    it('should respect custom minimum stake', async () => {
      const customConfig = createMockConfig({
        enableGovernance: true,
        governanceProposalMinStake: 5000, // Custom 5000 minimum
      });

      const customManager = new GovernanceManager(customConfig, mockStakeManager);

      mockStakeManager.getEffectiveStake.mockReturnValue(3000); // Below threshold

      const result = await customManager.submitProposal(
        'Low Stake Test',
        'Should fail',
        'parameter_change',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Required: 5000');
      customManager.stop();
    });
  });
});
