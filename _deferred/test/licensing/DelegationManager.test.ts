import {
  DelegationManager,
  DelegationProposalParams,
  DelegationRatificationParams,
  DelegatedActionParams,
  DelegationRevocationParams,
} from '../../src/licensing/DelegationManager';
import { MediatorConfig } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('DelegationManager', () => {
  let delegationManager: DelegationManager;
  let config: MediatorConfig;
  const testDataPath = './test-data/delegations';

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
      maxDelegationDepth: 3,
      enableLicensingSystem: true,
    } as MediatorConfig;

    delegationManager = new DelegationManager(config, testDataPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  describe('Delegation Proposal', () => {
    it('should propose a delegation successfully', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation', 'settlement proposal'],
        constraints: ['no final ratification', 'no financial commitments'],
        revocationConditions: ['completion of project', 'breach of trust'],
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        },
        transferability: {
          redelegationAllowed: true,
          maxRedelegationDepth: 2,
        },
      };

      const result = delegationManager.proposeDelegation(params);

      expect(result.success).toBe(true);
      expect(result.delegationId).toBeDefined();

      const delegation = delegationManager.getDelegation(result.delegationId!);
      expect(delegation).toBeDefined();
      expect(delegation?.status).toBe('proposed');
      expect(delegation?.delegatorId).toBe('delegator-1');
      expect(delegation?.delegateId).toBe('delegate-1');
      expect(delegation?.scope.delegatedPowers).toHaveLength(2);
      expect(delegation?.scope.constraints).toHaveLength(2);
      expect(delegation?.redelegationDepth).toBe(0);
    });

    it('should reject proposal without delegated powers', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: [],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one delegated power is required');
    });

    it('should reject proposal with empty power strings', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation', '  ', 'other'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Delegated powers cannot be empty');
    });

    it('should support redelegation with valid parent', () => {
      // Create parent delegation
      const parentParams: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation'],
        duration: {
          type: 'perpetual',
        },
        transferability: {
          redelegationAllowed: true,
          maxRedelegationDepth: 2,
        },
      };

      const parentResult = delegationManager.proposeDelegation(parentParams);
      const parentId = parentResult.delegationId!;

      // Ratify and activate parent
      delegationManager.ratifyDelegation({
        delegationId: parentId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'I delegate negotiation powers',
        humanAuthorship: true,
      });
      delegationManager.activateDelegation(parentId);

      // Create child delegation
      const childParams: DelegationProposalParams = {
        delegatorId: 'delegate-1', // Parent's delegate
        delegateId: 'delegate-2',
        proposedBy: 'delegate-1',
        delegatedPowers: ['negotiation'],
        duration: {
          type: 'perpetual',
        },
        parentDelegationId: parentId,
      };

      const childResult = delegationManager.proposeDelegation(childParams);

      expect(childResult.success).toBe(true);

      const childDelegation = delegationManager.getDelegation(childResult.delegationId!);
      expect(childDelegation?.redelegationDepth).toBe(1);
      expect(childDelegation?.parentDelegationId).toBe(parentId);
    });

    it('should reject redelegation when parent does not allow it', () => {
      // Create parent delegation without redelegation
      const parentParams: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation'],
        duration: {
          type: 'perpetual',
        },
        transferability: {
          redelegationAllowed: false,
        },
      };

      const parentResult = delegationManager.proposeDelegation(parentParams);
      const parentId = parentResult.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId: parentId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });
      delegationManager.activateDelegation(parentId);

      // Attempt child delegation
      const childParams: DelegationProposalParams = {
        delegatorId: 'delegate-1',
        delegateId: 'delegate-2',
        proposedBy: 'delegate-1',
        delegatedPowers: ['negotiation'],
        duration: {
          type: 'perpetual',
        },
        parentDelegationId: parentId,
      };

      const childResult = delegationManager.proposeDelegation(childParams);

      expect(childResult.success).toBe(false);
      expect(childResult.error).toContain('does not allow redelegation');
    });

    it('should reject redelegation exceeding depth limit', () => {
      config.maxDelegationDepth = 1;
      const newManager = new DelegationManager(config, testDataPath + '-depth');

      // Create parent
      const parentParams: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: { type: 'perpetual' },
        transferability: { redelegationAllowed: true, maxRedelegationDepth: 1 },
      };

      const parentResult = newManager.proposeDelegation(parentParams);
      const parentId = parentResult.delegationId!;

      newManager.ratifyDelegation({
        delegationId: parentId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });
      newManager.activateDelegation(parentId);

      // Create child (depth 1)
      const childParams: DelegationProposalParams = {
        delegatorId: 'delegate-1',
        delegateId: 'delegate-2',
        proposedBy: 'delegate-1',
        delegatedPowers: ['test'],
        duration: { type: 'perpetual' },
        parentDelegationId: parentId,
        transferability: { redelegationAllowed: true },
      };

      const childResult = newManager.proposeDelegation(childParams);
      const childId = childResult.delegationId!;

      newManager.ratifyDelegation({
        delegationId: childId,
        ratifiedBy: 'delegate-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });
      newManager.activateDelegation(childId);

      // Attempt grandchild (depth 2 - should fail)
      const grandchildParams: DelegationProposalParams = {
        delegatorId: 'delegate-2',
        delegateId: 'delegate-3',
        proposedBy: 'delegate-2',
        delegatedPowers: ['test'],
        duration: { type: 'perpetual' },
        parentDelegationId: childId,
      };

      const grandchildResult = newManager.proposeDelegation(grandchildParams);

      expect(grandchildResult.success).toBe(false);
      expect(grandchildResult.error).toContain('exceeds maximum');

      // Clean up
      if (fs.existsSync(testDataPath + '-depth')) {
        fs.rmSync(testDataPath + '-depth', { recursive: true, force: true });
      }
    });
  });

  describe('Delegation Ratification', () => {
    let delegationId: string;

    beforeEach(() => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      delegationId = result.delegationId!;
    });

    it('should ratify delegation successfully', () => {
      const result = delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'I delegate negotiation authority to Agent X, excluding settlement ratification',
        humanAuthorship: true,
        signature: 'sig-1',
      });

      expect(result.success).toBe(true);

      const delegation = delegationManager.getDelegation(delegationId);
      expect(delegation?.status).toBe('ratified');
      expect(delegation?.ratifiedAt).toBeDefined();
      expect(delegation?.humanAuthorship).toBe(true);
      expect(delegation?.delegationHash).toBeDefined();
      expect(delegation?.delegationHash.length).toBe(64); // SHA-256
    });

    it('should reject ratification by non-delegator', () => {
      const result = delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'other-user',
        ratificationStatement: 'Invalid',
        humanAuthorship: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only the delegator can ratify');
    });

    it('should reject ratification without human authorship', () => {
      const result = delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Human authorship required');
    });
  });

  describe('Delegated Actions', () => {
    let delegationId: string;

    beforeEach(() => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation', 'settlement proposal'],
        constraints: ['no financial commitments'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      delegationId = result.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      delegationManager.activateDelegation(delegationId);
    });

    it('should record action within scope', () => {
      const result = delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'negotiation',
        actionDescription: 'Proposed settlement terms for dispute resolution',
        referencedGrant: delegationId,
      });

      expect(result.success).toBe(true);
      expect(result.actionId).toBeDefined();
      expect(result.withinScope).toBe(true);

      const actions = delegationManager.getActionsForDelegation(delegationId);
      expect(actions).toHaveLength(1);
      expect(actions[0].withinScope).toBe(true);
    });

    it('should detect action outside scope', () => {
      const result = delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'financial',
        actionDescription: 'Made financial commitments on behalf of delegator',
        referencedGrant: delegationId,
      });

      expect(result.success).toBe(true);
      expect(result.withinScope).toBe(false);

      const outOfScopeActions = delegationManager.getOutOfScopeActions(delegationId);
      expect(outOfScopeActions).toHaveLength(1);
    });

    it('should reject action by non-delegate', () => {
      const result = delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'other-user',
        actionType: 'negotiation',
        actionDescription: 'Test',
        referencedGrant: delegationId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match delegation delegate');
    });

    it('should reject action without grant reference', () => {
      const result = delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'negotiation',
        actionDescription: 'Test',
        referencedGrant: 'wrong-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must reference the delegation grant');
    });
  });

  describe('Delegation Revocation', () => {
    let delegationId: string;

    beforeEach(() => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      delegationId = result.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      delegationManager.activateDelegation(delegationId);
    });

    it('should revoke delegation successfully', () => {
      const result = delegationManager.revokeDelegation({
        delegationId,
        revokedBy: 'delegator-1',
        revocationStatement: 'Delegation revoked due to project completion',
        signature: 'sig-1',
      });

      expect(result.success).toBe(true);

      const delegation = delegationManager.getDelegation(delegationId);
      expect(delegation?.status).toBe('revoked');
      expect(delegation?.revokedAt).toBeDefined();
      expect(delegation?.revocationStatement).toContain('project completion');
    });

    it('should reject revocation by non-delegator', () => {
      const result = delegationManager.revokeDelegation({
        delegationId,
        revokedBy: 'other-user',
        revocationStatement: 'Invalid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only the delegator can revoke');
    });
  });

  describe('Delegation Expiry', () => {
    it('should automatically expire time-bounded delegations', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: {
          type: 'time_bounded',
          expiresAt: Date.now() + 100, // Expires in 100ms
        },
      };

      const proposalResult = delegationManager.proposeDelegation(params);
      const delegationId = proposalResult.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      delegationManager.activateDelegation(delegationId);

      // Wait for expiry
      const waitTime = 200;
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // Busy wait
      }

      const result = delegationManager.checkAndExpireDelegations();

      expect(result.expiredCount).toBe(1);
      expect(result.expiredDelegations).toContain(delegationId);

      const delegation = delegationManager.getDelegation(delegationId);
      expect(delegation?.status).toBe('expired');
    });
  });

  describe('Delegation Queries', () => {
    beforeEach(() => {
      // Create multiple delegations
      for (let i = 1; i <= 3; i++) {
        const params: DelegationProposalParams = {
          delegatorId: `delegator-${i}`,
          delegateId: `delegate-${i}`,
          proposedBy: `delegator-${i}`,
          delegatedPowers: ['test'],
          duration: {
            type: 'perpetual',
          },
        };

        const result = delegationManager.proposeDelegation(params);

        if (i <= 2) {
          delegationManager.ratifyDelegation({
            delegationId: result.delegationId!,
            ratifiedBy: `delegator-${i}`,
            ratificationStatement: 'Test',
            humanAuthorship: true,
          });

          if (i === 1) {
            delegationManager.activateDelegation(result.delegationId!);
          }
        }
      }
    });

    it('should get delegations by delegator', () => {
      const delegations = delegationManager.getDelegationsByDelegator('delegator-1');

      expect(delegations).toHaveLength(1);
      expect(delegations[0].delegatorId).toBe('delegator-1');
    });

    it('should get delegations by delegate', () => {
      const delegations = delegationManager.getDelegationsByDelegate('delegate-2');

      expect(delegations).toHaveLength(1);
      expect(delegations[0].delegateId).toBe('delegate-2');
    });

    it('should get delegations by status', () => {
      const proposed = delegationManager.getDelegationsByStatus('proposed');
      const ratified = delegationManager.getDelegationsByStatus('ratified');
      const active = delegationManager.getDelegationsByStatus('active');

      expect(proposed).toHaveLength(1);
      expect(ratified).toHaveLength(1);
      expect(active).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      // Create delegations and actions
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['negotiation'],
        constraints: ['no commitments'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      const delegationId = result.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      delegationManager.activateDelegation(delegationId);

      // Record actions
      delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'negotiation',
        actionDescription: 'In scope action',
        referencedGrant: delegationId,
      });

      delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'commitment',
        actionDescription: 'Out of scope action with commitments',
        referencedGrant: delegationId,
      });

      const stats = delegationManager.getStats();

      expect(stats.totalDelegations).toBe(1);
      expect(stats.activeDelegations).toBe(1);
      expect(stats.totalActions).toBe(2);
      expect(stats.actionsWithinScope).toBe(1);
      expect(stats.actionsOutOfScope).toBe(1);
      expect(stats.averageRedelegationDepth).toBe(0);
    });
  });

  describe('Persistence', () => {
    it('should persist delegations to disk', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      const delegationId = result.delegationId!;

      // Check file exists
      const filePath = path.join(testDataPath, `${delegationId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify content
      const content = fs.readFileSync(filePath, 'utf-8');
      const delegation = JSON.parse(content);
      expect(delegation.delegationId).toBe(delegationId);
    });

    it('should load delegations from disk', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      const delegationId = result.delegationId!;

      // Create new manager instance
      const newManager = new DelegationManager(config, testDataPath);

      // Verify delegation was loaded
      const delegation = newManager.getDelegation(delegationId);
      expect(delegation).toBeDefined();
      expect(delegation?.delegatorId).toBe('delegator-1');
    });

    it('should persist actions to disk', () => {
      const params: DelegationProposalParams = {
        delegatorId: 'delegator-1',
        delegateId: 'delegate-1',
        proposedBy: 'delegator-1',
        delegatedPowers: ['test'],
        duration: {
          type: 'perpetual',
        },
      };

      const result = delegationManager.proposeDelegation(params);
      const delegationId = result.delegationId!;

      delegationManager.ratifyDelegation({
        delegationId,
        ratifiedBy: 'delegator-1',
        ratificationStatement: 'Test',
        humanAuthorship: true,
      });

      delegationManager.activateDelegation(delegationId);

      const actionResult = delegationManager.recordDelegatedAction({
        delegationId,
        delegateId: 'delegate-1',
        actionType: 'test',
        actionDescription: 'Test action',
        referencedGrant: delegationId,
      });

      const actionId = actionResult.actionId!;

      // Check action file exists
      const actionFilePath = path.join(testDataPath, 'actions', `${actionId}.json`);
      expect(fs.existsSync(actionFilePath)).toBe(true);
    });
  });
});
