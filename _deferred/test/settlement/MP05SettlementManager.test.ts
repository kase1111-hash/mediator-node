import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import { MediatorConfig, MP05SettlementStatus } from '../../src/types';
import { MP05SettlementValidator } from '../../src/settlement/MP05SettlementValidator';
import {
  MP05SettlementManager,
  SettlementInitiationParams,
  SettlementDeclarationParams,
} from '../../src/settlement/MP05SettlementManager';

describe('MP05SettlementManager Unit Tests', () => {
  const testDataPath = './test-data/mp05-settlement-manager';
  let config: MediatorConfig;
  let validator: MP05SettlementValidator;
  let settlementManager: MP05SettlementManager;

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
      enableRiskTracking: true,
      autoValidatePreconditions: false,
    } as MediatorConfig;

    validator = new MP05SettlementValidator(config);
    settlementManager = new MP05SettlementManager(config, testDataPath, validator);
  });

  afterEach(() => {
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true });
    }
  });

  describe('Settlement Initiation', () => {
    it('should initiate settlement successfully', () => {
      const params: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'We agree to settle this matter',
      };

      const result = settlementManager.initiateSettlement(params);
      expect(result.success).toBe(true);
      expect(result.settlementId).toBeDefined();

      const settlement = settlementManager.getSettlement(result.settlementId!);
      expect(settlement?.status).toBe('declared');
      expect(settlement?.requiredParties).toHaveLength(2);
    });

    it('should reject initiation without required fields', () => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: '',
        requiredParties: [],
        referencedAgreements: [],
        referencedReceipts: [],
        settlementStatement: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject initiation when settlement system disabled', () => {
      const disabledConfig = { ...config, enableSettlementSystem: false };
      const disabledManager = new MP05SettlementManager(
        disabledConfig,
        testDataPath,
        validator
      );

      const result = disabledManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should initiate staged settlement', () => {
      const params: SettlementInitiationParams = {
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Staged settlement',
        isStaged: true,
        stages: [
          {
            stageNumber: 1,
            description: 'Phase 1',
            completionCriteria: 'Criteria 1',
            valuePercentage: 50,
          },
          {
            stageNumber: 2,
            description: 'Phase 2',
            completionCriteria: 'Criteria 2',
            valuePercentage: 50,
          },
        ],
      };

      const result = settlementManager.initiateSettlement(params);
      expect(result.success).toBe(true);

      const settlement = settlementManager.getSettlement(result.settlementId!);
      expect(settlement?.isStaged).toBe(true);
      expect(settlement?.stages).toHaveLength(2);
    });
  });

  describe('Settlement Declaration', () => {
    let settlementId: string;

    beforeEach(() => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test settlement',
      });
      settlementId = result.settlementId!;
    });

    it('should record settlement declaration', () => {
      const params: SettlementDeclarationParams = {
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'I declare this settlement',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-1',
      };

      const result = settlementManager.declareSettlement(params);
      expect(result.success).toBe(true);
      expect(result.declarationId).toBeDefined();
      expect(result.ratified).toBe(false);

      const settlement = settlementManager.getSettlement(settlementId);
      expect(settlement?.declarations).toHaveLength(1);
    });

    it('should auto-ratify when all parties declare', () => {
      settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration by party 1',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-1',
      });

      const result = settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-2',
        declarationStatement: 'Declaration by party 2',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-2',
      });

      expect(result.success).toBe(true);
      expect(result.ratified).toBe(true);

      const settlement = settlementManager.getSettlement(settlementId);
      expect(settlement?.status).toBe('ratified');
      expect(settlement?.ratifiedAt).toBeDefined();
    });

    it('should reject declaration without human authorship', () => {
      const result = settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: false,
        signature: 'sig',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Human authorship');
    });

    it('should reject duplicate declaration from same party', () => {
      settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'First declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-1',
      });

      const result = settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Second declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already declared');
    });

    it('should reject declaration by non-party', () => {
      const result = settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-3',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
    });
  });

  describe('Settlement Finalization', () => {
    let settlementId: string;

    beforeEach(() => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test settlement',
      });
      settlementId = result.settlementId!;

      settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration 1',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-1',
      });

      settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-2',
        declarationStatement: 'Declaration 2',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig-2',
      });
    });

    it('should finalize ratified settlement', () => {
      const result = settlementManager.finalizeSettlement(settlementId);
      expect(result.success).toBe(true);

      const settlement = settlementManager.getSettlement(settlementId);
      expect(settlement?.status).toBe('finalized');
      expect(settlement?.immutable).toBe(true);
      expect(settlement?.finalizedAt).toBeDefined();
    });

    it('should reject finalization of non-ratified settlement', () => {
      const newResult = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test',
      });

      const result = settlementManager.finalizeSettlement(newResult.settlementId!);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be ratified');
    });

    it('should reject modifications to finalized settlement', () => {
      settlementManager.finalizeSettlement(settlementId);

      const result = settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'New declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('immutable');
    });
  });

  describe('Staged Settlement', () => {
    let settlementId: string;

    beforeEach(() => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Staged settlement',
        isStaged: true,
        stages: [
          {
            stageNumber: 1,
            description: 'Stage 1',
            completionCriteria: 'Criteria 1',
          },
          {
            stageNumber: 2,
            description: 'Stage 2',
            completionCriteria: 'Criteria 2',
          },
          {
            stageNumber: 3,
            description: 'Stage 3',
            completionCriteria: 'Criteria 3',
          },
        ],
      });
      settlementId = result.settlementId!;
    });

    it('should complete stages sequentially', () => {
      const result1 = settlementManager.completeStage({
        settlementId,
        stageNumber: 1,
        completedBy: 'party-1',
      });
      expect(result1.success).toBe(true);

      const settlement1 = settlementManager.getSettlement(settlementId);
      expect(settlement1?.currentStage).toBe(1);

      const result2 = settlementManager.completeStage({
        settlementId,
        stageNumber: 2,
        completedBy: 'party-1',
      });
      expect(result2.success).toBe(true);

      const settlement2 = settlementManager.getSettlement(settlementId);
      expect(settlement2?.currentStage).toBe(2);
    });

    it('should reject out-of-sequence stage completion', () => {
      const result = settlementManager.completeStage({
        settlementId,
        stageNumber: 2,
        completedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be completed before');
    });

    it('should reject stage completion on non-staged settlement', () => {
      const newResult = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Non-staged',
      });

      const result = settlementManager.completeStage({
        settlementId: newResult.settlementId!,
        stageNumber: 1,
        completedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not staged');
    });
  });

  describe('Settlement Contest and Reversal', () => {
    let settlementId: string;

    beforeEach(() => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test settlement',
      });
      settlementId = result.settlementId!;
    });

    it('should contest settlement', () => {
      const result = settlementManager.contestSettlement(settlementId, 'dispute-123');
      expect(result.success).toBe(true);

      const settlement = settlementManager.getSettlement(settlementId);
      expect(settlement?.status).toBe('contested');
      expect(settlement?.disputeId).toBe('dispute-123');
      expect(settlement?.contestedAt).toBeDefined();
    });

    it('should reverse finalized settlement', () => {
      settlementManager.declareSettlement({
        settlementId,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      settlementManager.finalizeSettlement(settlementId);

      const result = settlementManager.reverseSettlement(settlementId, 'reversal-1');
      expect(result.success).toBe(true);

      const settlement = settlementManager.getSettlement(settlementId);
      expect(settlement?.status).toBe('reversed');
      expect(settlement?.reversalSettlementId).toBe('reversal-1');
    });
  });

  describe('Query Methods', () => {
    it('should query settlements by party', () => {
      settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1', 'party-2'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement 1',
      });

      settlementManager.initiateSettlement({
        initiatedBy: 'party-2',
        requiredParties: ['party-2', 'party-3'],
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        settlementStatement: 'Settlement 2',
      });

      const settlementsForParty1 = settlementManager.getSettlementsByParty('party-1');
      expect(settlementsForParty1).toHaveLength(1);

      const settlementsForParty2 = settlementManager.getSettlementsByParty('party-2');
      expect(settlementsForParty2).toHaveLength(2);
    });

    it('should query settlements by status', () => {
      const result1 = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement 1',
      });

      settlementManager.declareSettlement({
        settlementId: result1.settlementId!,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      settlementManager.finalizeSettlement(result1.settlementId!);

      settlementManager.initiateSettlement({
        initiatedBy: 'party-2',
        requiredParties: ['party-2'],
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        settlementStatement: 'Settlement 2',
      });

      const finalized = settlementManager.getSettlementsByStatus('finalized' as MP05SettlementStatus);
      expect(finalized).toHaveLength(1);

      const declared = settlementManager.getSettlementsByStatus('declared' as MP05SettlementStatus);
      expect(declared).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive statistics', () => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Settlement',
        isStaged: true,
        stages: [{ stageNumber: 1, description: 'Stage', completionCriteria: 'Criteria' }],
      });

      settlementManager.declareSettlement({
        settlementId: result.settlementId!,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        humanAuthorship: true,
        signature: 'sig',
      });

      // Complete the stage before finalizing
      settlementManager.completeStage({
        settlementId: result.settlementId!,
        stageNumber: 1,
        completedBy: 'party-1',
      });

      settlementManager.finalizeSettlement(result.settlementId!);

      const stats = settlementManager.getStats();

      expect(stats.totalSettlements).toBe(1);
      expect(stats.finalizedSettlements).toBe(1);
      expect(stats.stagedSettlements).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('should persist settlements to disk', () => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test settlement',
      });

      const filePath = `${testDataPath}/${result.settlementId}.json`;
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should load settlements from disk on initialization', () => {
      const result = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-1'],
        referencedReceipts: ['receipt-1'],
        settlementStatement: 'Test settlement',
      });

      const newManager = new MP05SettlementManager(config, testDataPath, validator);
      const loaded = newManager.getSettlement(result.settlementId!);

      expect(loaded).toBeDefined();
      expect(loaded?.settlementStatement).toBe('Test settlement');
    });
  });
});
