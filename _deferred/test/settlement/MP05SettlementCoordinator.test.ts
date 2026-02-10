import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import { MediatorConfig } from '../../src/types';
import { MP05SettlementCoordinator } from '../../src/settlement/MP05SettlementCoordinator';
import {
  SettlementInitiationParams,
  SettlementDeclarationParams,
} from '../../src/settlement/MP05SettlementManager';
import { CapitalizationEventParams } from '../../src/settlement/MP05CapitalizationManager';

describe('MP05SettlementCoordinator Integration Tests', () => {
  const testDataPath = './test-data/mp05-coordinator';
  let config: MediatorConfig;
  let coordinator: MP05SettlementCoordinator;

  beforeEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true });
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
      enableSettlementSystem: true,
      requireMutualSettlement: true,
      allowPartialSettlement: true,
      enableCapitalization: true,
      enableRiskTracking: true,
      autoValidatePreconditions: false, // Disable for testing without full system
    } as MediatorConfig;

    coordinator = new MP05SettlementCoordinator(config, testDataPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize all components successfully', () => {
      expect(coordinator).toBeDefined();
      expect(coordinator.getValidator()).toBeDefined();
      expect(coordinator.getSettlementManager()).toBeDefined();
      expect(coordinator.getCapitalizationManager()).toBeDefined();
    });
  });

  describe('Settlement Lifecycle', () => {
    it('should support complete settlement lifecycle', () => {
      const initiationParams: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'We agree to settle our collaboration agreement',
        valueDescription: 'Payment of $10,000 for delivered work',
      };

      // Initiate settlement
      const initiationResult = coordinator.initiateSettlement(initiationParams);
      expect(initiationResult.success).toBe(true);
      const settlementId = initiationResult.settlementId!;

      // Party 1 declares
      const declaration1Result = coordinator.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'I declare this settlement complete and fair',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        valueDescription: 'Payment of $10,000',
        humanAuthorship: true,
        signature: 'sig-1',
      });
      expect(declaration1Result.success).toBe(true);
      expect(declaration1Result.ratified).toBe(false);

      // Party 2 declares
      const declaration2Result = coordinator.declareSettlement({
        settlementId,
        declaringPartyId: 'party-2',
        declarationStatement: 'I acknowledge and accept this settlement',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        valueDescription: 'Receipt of $10,000',
        humanAuthorship: true,
        signature: 'sig-2',
      });
      expect(declaration2Result.success).toBe(true);
      expect(declaration2Result.ratified).toBe(true);

      // Finalize settlement
      const finalizationResult = coordinator.finalizeSettlement(settlementId);
      expect(finalizationResult.success).toBe(true);

      const settlement = coordinator.getSettlement(settlementId);
      expect(settlement?.status).toBe('finalized');
      expect(settlement?.immutable).toBe(true);
    });

    it('should support staged settlements', () => {
      const initiationParams: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Staged settlement with milestones',
        isStaged: true,
        stages: [
          {
            stageNumber: 1,
            description: 'Phase 1: Design completion',
            completionCriteria: 'Design documents delivered',
            valuePercentage: 30,
          },
          {
            stageNumber: 2,
            description: 'Phase 2: Development',
            completionCriteria: 'Code delivered and tested',
            valuePercentage: 50,
          },
          {
            stageNumber: 3,
            description: 'Phase 3: Deployment',
            completionCriteria: 'System deployed to production',
            valuePercentage: 20,
          },
        ],
      };

      const initiationResult = coordinator.initiateSettlement(initiationParams);
      expect(initiationResult.success).toBe(true);
      const settlementId = initiationResult.settlementId!;

      // Complete stages sequentially
      const stage1Result = coordinator.completeStage({
        settlementId,
        stageNumber: 1,
        completedBy: 'party-1',
      });
      expect(stage1Result.success).toBe(true);

      const stage2Result = coordinator.completeStage({
        settlementId,
        stageNumber: 2,
        completedBy: 'party-1',
      });
      expect(stage2Result.success).toBe(true);

      const settlement = coordinator.getSettlement(settlementId);
      expect(settlement?.currentStage).toBe(2);
    });

    it('should handle settlement contest', () => {
      const initiationParams: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement under dispute',
      };

      const initiationResult = coordinator.initiateSettlement(initiationParams);
      const settlementId = initiationResult.settlementId!;

      const contestResult = coordinator.contestSettlement(settlementId, 'dispute-123');
      expect(contestResult.success).toBe(true);

      const settlement = coordinator.getSettlement(settlementId);
      expect(settlement?.status).toBe('contested');
      expect(settlement?.disputeId).toBe('dispute-123');
    });

    it('should handle settlement reversal', () => {
      const initiationParams: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Original settlement',
      };

      const initiationResult = coordinator.initiateSettlement(initiationParams);
      const settlementId = initiationResult.settlementId!;

      // Declare and finalize
      coordinator.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'I declare this settlement',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      coordinator.finalizeSettlement(settlementId);

      // Reverse
      const reversalResult = coordinator.reverseSettlement(settlementId, 'reversal-settlement-1');
      expect(reversalResult.success).toBe(true);

      const settlement = coordinator.getSettlement(settlementId);
      expect(settlement?.status).toBe('reversed');
    });
  });

  describe('Capitalization', () => {
    let finalizedSettlementId: string;

    beforeEach(() => {
      // Create and finalize a settlement
      const initiationResult = coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement for capitalization',
        valueDescription: 'Payment of $50,000',
      });

      finalizedSettlementId = initiationResult.settlementId!;

      coordinator.declareSettlement({
        settlementId: finalizedSettlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration by party 1',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-1',
      });

      coordinator.declareSettlement({
        settlementId: finalizedSettlementId,
        declaringPartyId: 'party-2',
        declarationStatement: 'Declaration by party 2',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-2',
      });

      coordinator.finalizeSettlement(finalizedSettlementId);
    });

    it('should create capitalization event for payment claim', () => {
      const eventParams: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '50000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      };

      const eventResult = coordinator.createCapitalizationEvent(eventParams);
      expect(eventResult.success).toBe(true);
      expect(eventResult.eventId).toBeDefined();

      const event = coordinator.getCapitalizationEvent(eventResult.eventId!);
      expect(event?.valueType).toBe('payment_claim');
      expect(event?.amount).toBe('50000');
    });

    it('should create capitalization event for revenue share', () => {
      const eventParams: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'revenue_share',
        formula: '30% of net revenue',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
        conditions: ['Revenue share active for 24 months', 'Minimum quarterly payment $1000'],
      };

      const eventResult = coordinator.createCapitalizationEvent(eventParams);
      expect(eventResult.success).toBe(true);

      const event = coordinator.getCapitalizationEvent(eventResult.eventId!);
      expect(event?.valueType).toBe('revenue_share');
      expect(event?.formula).toBe('30% of net revenue');
      expect(event?.conditions).toHaveLength(2);
    });

    it('should create capitalization event for equity interest', () => {
      const eventParams: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'equity_interest',
        amount: '10000', // 10,000 shares
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
        rights: ['voting rights', 'dividend rights', 'liquidation preference'],
      };

      const eventResult = coordinator.createCapitalizationEvent(eventParams);
      expect(eventResult.success).toBe(true);

      const event = coordinator.getCapitalizationEvent(eventResult.eventId!);
      expect(event?.valueType).toBe('equity_interest');
      expect(event?.rights).toContain('voting rights');
    });

    it('should generate capitalization interface', () => {
      const eventResult = coordinator.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '50000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      });

      const interfaceResult = coordinator.generateCapitalizationInterface({
        settlementId: finalizedSettlementId,
        eventId: eventResult.eventId!,
        valueType: 'payment_claim',
        amount: '50000',
        currency: 'USD',
        beneficiaries: [
          { partyId: 'party-1', amount: '30000' },
          { partyId: 'party-2', amount: '20000' },
        ],
      });

      expect(interfaceResult.success).toBe(true);
      expect(interfaceResult.interfaceId).toBeDefined();

      const iface = coordinator.getCapitalizationInterface(interfaceResult.interfaceId!);
      expect(iface?.currency).toBe('USD');
      expect(iface?.beneficiaries).toHaveLength(2);
    });

    it('should record execution metadata', () => {
      const eventResult = coordinator.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '50000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      });

      const executionResult = coordinator.recordExecution(eventResult.eventId!, {
        executedAt: Date.now(),
        executedBy: 'payment-processor',
        transactionHash: '0x1234567890abcdef',
        confirmations: 12,
        status: 'confirmed',
      });

      expect(executionResult.success).toBe(true);
    });
  });

  describe('External System Integration', () => {
    let interfaceId: string;

    beforeEach(() => {
      // Create finalized settlement and interface
      const initiationResult = coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement for external integration',
      });

      const settlementId = initiationResult.settlementId!;

      coordinator.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      coordinator.finalizeSettlement(settlementId);

      const eventResult = coordinator.createCapitalizationEvent({
        settlementId,
        valueType: 'payment_claim',
        amount: '25000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
        externalReferences: {
          blockchain: 'ethereum',
          contractAddress: '0xabcdef1234567890',
        },
      });

      const interfaceResult = coordinator.generateCapitalizationInterface({
        settlementId,
        eventId: eventResult.eventId!,
        valueType: 'payment_claim',
        amount: '25000',
        currency: 'USD',
        beneficiaries: [{ partyId: 'party-1', amount: '25000' }],
        executionHints: {
          smartContractABI: '[]',
          paymentInstructions: 'Wire transfer to account 123456',
        },
      });

      interfaceId = interfaceResult.interfaceId!;
    });

    it('should generate blockchain instructions', () => {
      const result = coordinator.generateBlockchainInstructions(interfaceId);
      expect(result.success).toBe(true);
      expect(result.instructions).toBeDefined();
      expect(result.instructions?.functionName).toBe('transferPayment');
      expect(result.instructions?.parameters).toBeDefined();
    });

    it('should generate payment instructions', () => {
      const result = coordinator.generatePaymentInstructions(interfaceId);
      expect(result.success).toBe(true);
      expect(result.instructions).toBeDefined();
      expect(result.instructions?.beneficiaries).toHaveLength(1);
      expect(result.instructions?.reference).toContain('SETTLEMENT-');
    });

    it('should generate accounting entries', () => {
      const result = coordinator.generateAccountingEntries(interfaceId);
      expect(result.success).toBe(true);
      expect(result.entries).toBeDefined();
      expect(result.entries!.length).toBeGreaterThan(0);
      expect(result.entries![0].account).toBeDefined();
    });
  });

  describe('Complete Workflow', () => {
    it('should complete full settlement and capitalization workflow', () => {
      const workflowResult = coordinator.completeSettlementWorkflow({
        settlement: {
          initiatedBy: 'party-1',
          requiredParties: ['party-1', 'party-2'],
          referencedAgreements: ['agreement-1'],
          referencedReceipts: ['receipt-1'],
          settlementStatement: 'Complete workflow settlement',
          valueDescription: 'Payment of $100,000',
        },
        declarations: [
          {
            declaringPartyId: 'party-1',
            declarationStatement: 'I declare this settlement complete',
            referencedAgreements: ['agreement-1'],
            referencedReceipts: ['receipt-1'],
            humanAuthorship: true,
            signature: 'sig-1',
          },
          {
            declaringPartyId: 'party-2',
            declarationStatement: 'I acknowledge this settlement',
            referencedAgreements: ['agreement-1'],
            referencedReceipts: ['receipt-1'],
            humanAuthorship: true,
            signature: 'sig-2',
          },
        ],
        capitalization: {
          valueType: 'payment_claim',
          amount: '100000',
          beneficiaries: ['party-1', 'party-2'],
          issuedBy: 'party-1',
        },
        generateInterface: true,
      });

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.settlementId).toBeDefined();
      expect(workflowResult.eventId).toBeDefined();
      expect(workflowResult.interfaceId).toBeDefined();
      expect(workflowResult.errors).toHaveLength(0);

      // Verify settlement
      const settlement = coordinator.getSettlement(workflowResult.settlementId!);
      expect(settlement?.status).toBe('finalized');

      // Verify event
      const event = coordinator.getCapitalizationEvent(workflowResult.eventId!);
      expect(event).toBeDefined();

      // Verify interface
      const iface = coordinator.getCapitalizationInterface(workflowResult.interfaceId!);
      expect(iface).toBeDefined();
    });
  });

  describe('Query Methods', () => {
    it('should query settlements by party', () => {
      coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement 1',
      });

      coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-3'],
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        settlementStatement: 'Settlement 2',
      });

      const settlements = coordinator.getSettlementsByParty('party-1');
      expect(settlements).toHaveLength(2);
      expect(settlements.every((s) => s.requiredParties.includes('party-1'))).toBe(true);
    });

    it('should get settlement summary with all related data', () => {
      const initiationResult = coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Summary test settlement',
      });

      const settlementId = initiationResult.settlementId!;

      coordinator.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      coordinator.finalizeSettlement(settlementId);

      coordinator.createCapitalizationEvent({
        settlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const summary = coordinator.getSettlementSummary(settlementId);
      expect(summary.settlement).toBeDefined();
      expect(summary.events).toHaveLength(1);
      expect(summary.risks).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive statistics', () => {
      // Create settlements
      const settlement1Result = coordinator.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement 1',
      });

      coordinator.declareSettlement({
        settlementId: settlement1Result.settlementId!,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      coordinator.finalizeSettlement(settlement1Result.settlementId!);

      // Create capitalization
      coordinator.createCapitalizationEvent({
        settlementId: settlement1Result.settlementId!,
        valueType: 'payment_claim',
        amount: '5000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const stats = coordinator.getStats();

      expect(stats.settlements.totalSettlements).toBe(1);
      expect(stats.settlements.finalizedSettlements).toBe(1);
      expect(stats.capitalization.totalEvents).toBe(1);
    });
  });

  describe('Precondition Validation', () => {
    it('should validate preconditions before settlement', () => {
      const validationResult = coordinator.validatePreconditions({
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        declaringPartyId: 'party-1',
      });

      // Should succeed with warnings since we disabled auto-validation
      expect(validationResult.valid).toBe(true);
    });
  });
});
