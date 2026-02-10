import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import { MediatorConfig } from '../../src/types';
import { MP05SettlementValidator } from '../../src/settlement/MP05SettlementValidator';
import { MP05SettlementManager } from '../../src/settlement/MP05SettlementManager';
import {
  MP05CapitalizationManager,
  CapitalizationEventParams,
  CapitalizationInterfaceParams,
} from '../../src/settlement/MP05CapitalizationManager';

describe('MP05CapitalizationManager Unit Tests', () => {
  const testDataPath = './test-data/mp05-capitalization-manager';
  const settlementDataPath = './test-data/mp05-settlements-for-cap';
  let config: MediatorConfig;
  let validator: MP05SettlementValidator;
  let settlementManager: MP05SettlementManager;
  let capitalizationManager: MP05CapitalizationManager;
  let finalizedSettlementId: string;

  beforeEach(() => {
    [testDataPath, settlementDataPath].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });

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
      enableCapitalization: true,
      autoValidatePreconditions: false,
    } as MediatorConfig;

    validator = new MP05SettlementValidator(config);
    settlementManager = new MP05SettlementManager(config, settlementDataPath, validator);
    capitalizationManager = new MP05CapitalizationManager(
      config,
      testDataPath,
      settlementManager
    );

    // Create and finalize a settlement for testing
    const initiationResult = settlementManager.initiateSettlement({
      initiatedBy: 'party-1',
      requiredParties: ['party-1', 'party-2'],
      referencedAgreements: ['agreement-1'],
      referencedReceipts: ['receipt-1'],
      settlementStatement: 'Test settlement for capitalization',
    });

    finalizedSettlementId = initiationResult.settlementId!;

    settlementManager.declareSettlement({
      settlementId: finalizedSettlementId,
      declaringPartyId: 'party-1',
      declarationStatement: 'Declaration 1',
      referencedAgreements: ['agreement-1'],
      referencedReceipts: ['receipt-1'],
      humanAuthorship: true,
      signature: 'sig-1',
    });

    settlementManager.declareSettlement({
      settlementId: finalizedSettlementId,
      declaringPartyId: 'party-2',
      declarationStatement: 'Declaration 2',
      referencedAgreements: ['agreement-1'],
      referencedReceipts: ['receipt-1'],
      humanAuthorship: true,
      signature: 'sig-2',
    });

    settlementManager.finalizeSettlement(finalizedSettlementId);
  });

  afterEach(() => {
    [testDataPath, settlementDataPath].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  describe('Capitalization Event Creation', () => {
    it('should create payment claim event', () => {
      const params: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '50000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      };

      const result = capitalizationManager.createCapitalizationEvent(params);
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();

      const event = capitalizationManager.getEvent(result.eventId!);
      expect(event?.valueType).toBe('payment_claim');
      expect(event?.amount).toBe('50000');
      expect(event?.eventHash).toBeDefined();
    });

    it('should create revenue share event', () => {
      const params: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'revenue_share',
        formula: '25% of gross revenue',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
        conditions: ['Active for 36 months', 'Minimum quarterly payment $5000'],
      };

      const result = capitalizationManager.createCapitalizationEvent(params);
      expect(result.success).toBe(true);

      const event = capitalizationManager.getEvent(result.eventId!);
      expect(event?.valueType).toBe('revenue_share');
      expect(event?.formula).toBe('25% of gross revenue');
      expect(event?.conditions).toHaveLength(2);
    });

    it('should create equity interest event', () => {
      const params: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'equity_interest',
        amount: '15000',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
        rights: ['voting rights', 'dividend rights', 'board seat'],
      };

      const result = capitalizationManager.createCapitalizationEvent(params);
      expect(result.success).toBe(true);

      const event = capitalizationManager.getEvent(result.eventId!);
      expect(event?.valueType).toBe('equity_interest');
      expect(event?.rights).toContain('voting rights');
    });

    it('should create token event', () => {
      const params: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'token',
        amount: '1000000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
        externalReferences: {
          blockchain: 'ethereum',
          contractAddress: '0x1234567890abcdef',
        },
      };

      const result = capitalizationManager.createCapitalizationEvent(params);
      expect(result.success).toBe(true);

      const event = capitalizationManager.getEvent(result.eventId!);
      expect(event?.valueType).toBe('token');
      expect(event?.externalReferences?.blockchain).toBe('ethereum');
    });

    it('should create contractual right event', () => {
      const params: CapitalizationEventParams = {
        settlementId: finalizedSettlementId,
        valueType: 'contractual_right',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
        rights: ['exclusive distribution rights', 'sublicensing rights'],
      };

      const result = capitalizationManager.createCapitalizationEvent(params);
      expect(result.success).toBe(true);

      const event = capitalizationManager.getEvent(result.eventId!);
      expect(event?.valueType).toBe('contractual_right');
      expect(event?.rights).toHaveLength(2);
    });

    it('should reject event for non-existent settlement', () => {
      const result = capitalizationManager.createCapitalizationEvent({
        settlementId: 'non-existent',
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject event for non-finalized settlement', () => {
      const newResult = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        settlementStatement: 'Non-finalized settlement',
      });

      const result = capitalizationManager.createCapitalizationEvent({
        settlementId: newResult.settlementId!,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be finalized');
    });

    it('should reject event with invalid beneficiaries', () => {
      const result = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-3'], // Not a settlement party
        issuedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be parties to the settlement');
    });

    it('should reject event when capitalization disabled', () => {
      const disabledConfig = { ...config, enableCapitalization: false };
      const disabledManager = new MP05CapitalizationManager(
        disabledConfig,
        testDataPath,
        settlementManager
      );

      const result = disabledManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });
  });

  describe('Capitalization Interface Generation', () => {
    let eventId: string;

    beforeEach(() => {
      const eventResult = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '75000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      });
      eventId = eventResult.eventId!;
    });

    it('should generate capitalization interface', () => {
      const params: CapitalizationInterfaceParams = {
        settlementId: finalizedSettlementId,
        eventId,
        valueType: 'payment_claim',
        amount: '75000',
        currency: 'USD',
        beneficiaries: [
          { partyId: 'party-1', amount: '45000' },
          { partyId: 'party-2', amount: '30000' },
        ],
      };

      const result = capitalizationManager.generateCapitalizationInterface(params);
      expect(result.success).toBe(true);
      expect(result.interfaceId).toBeDefined();

      const iface = capitalizationManager.getInterface(result.interfaceId!);
      expect(iface?.currency).toBe('USD');
      expect(iface?.beneficiaries).toHaveLength(2);
      expect(iface?.interfaceHash).toBeDefined();
    });

    it('should validate percentage totals', () => {
      const result = capitalizationManager.generateCapitalizationInterface({
        settlementId: finalizedSettlementId,
        eventId,
        valueType: 'payment_claim',
        beneficiaries: [
          { partyId: 'party-1', percentage: 60 },
          { partyId: 'party-2', percentage: 30 }, // Totals 90%, not 100%
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must sum to 100%');
    });

    it('should include upstream references', () => {
      const params: CapitalizationInterfaceParams = {
        settlementId: finalizedSettlementId,
        eventId,
        valueType: 'payment_claim',
        beneficiaries: [{ partyId: 'party-1', amount: '75000' }],
      };

      const result = capitalizationManager.generateCapitalizationInterface(params);
      const iface = capitalizationManager.getInterface(result.interfaceId!);

      expect(iface?.upstreamReferences.agreements).toContain('agreement-1');
      expect(iface?.upstreamReferences.receipts).toContain('receipt-1');
    });

    it('should include execution hints', () => {
      const params: CapitalizationInterfaceParams = {
        settlementId: finalizedSettlementId,
        eventId,
        valueType: 'payment_claim',
        beneficiaries: [{ partyId: 'party-1', amount: '75000' }],
        executionHints: {
          smartContractABI: '[]',
          paymentInstructions: 'Wire to account 123456',
          legalTemplate: 'template-xyz',
        },
      };

      const result = capitalizationManager.generateCapitalizationInterface(params);
      const iface = capitalizationManager.getInterface(result.interfaceId!);

      expect(iface?.executionHints?.smartContractABI).toBe('[]');
      expect(iface?.executionHints?.paymentInstructions).toContain('Wire to');
    });

    it('should reject interface for mismatched event and settlement', () => {
      const newSettlement = settlementManager.initiateSettlement({
        initiatedBy: 'party-1',
        requiredParties: ['party-1'],
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        settlementStatement: 'Different settlement',
      });

      settlementManager.declareSettlement({
        settlementId: newSettlement.settlementId!,
        declaringPartyId: 'party-1',
        declarationStatement: 'Declaration',
        referencedAgreements: ['agreement-2'],
        referencedReceipts: ['receipt-2'],
        humanAuthorship: true,
        signature: 'sig',
      });

      settlementManager.finalizeSettlement(newSettlement.settlementId!);

      const result = capitalizationManager.generateCapitalizationInterface({
        settlementId: newSettlement.settlementId!,
        eventId, // From different settlement
        valueType: 'payment_claim',
        beneficiaries: [{ partyId: 'party-1', amount: '10000' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not belong to settlement');
    });
  });

  describe('Execution Metadata', () => {
    let eventId: string;

    beforeEach(() => {
      const eventResult = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '25000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });
      eventId = eventResult.eventId!;
    });

    it('should record execution metadata', () => {
      const result = capitalizationManager.recordExecution(eventId, {
        executedAt: Date.now(),
        executedBy: 'payment-processor',
        transactionHash: '0xabcdef123456',
        confirmations: 12,
        status: 'confirmed',
      });

      expect(result.success).toBe(true);

      const metadata = capitalizationManager.getExecutionMetadata(eventId);
      expect(metadata?.status).toBe('confirmed');
      expect(metadata?.transactionHash).toBe('0xabcdef123456');
    });

    it('should track pending executions', () => {
      capitalizationManager.recordExecution(eventId, {
        executedAt: Date.now(),
        status: 'pending',
      });

      const pending = capitalizationManager.getPendingExecutions();
      expect(pending).toHaveLength(1);
      expect(pending[0].eventId).toBe(eventId);
    });

    it('should reject execution for non-existent event', () => {
      const result = capitalizationManager.recordExecution('non-existent', {
        executedAt: Date.now(),
        status: 'confirmed',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('External System Integration', () => {
    let interfaceId: string;

    beforeEach(() => {
      const eventResult = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '100000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
        externalReferences: {
          blockchain: 'ethereum',
          contractAddress: '0x1234567890abcdef',
        },
      });

      const interfaceResult = capitalizationManager.generateCapitalizationInterface({
        settlementId: finalizedSettlementId,
        eventId: eventResult.eventId!,
        valueType: 'payment_claim',
        amount: '100000',
        currency: 'USD',
        beneficiaries: [
          { partyId: 'party-1', amount: '60000' },
          { partyId: 'party-2', amount: '40000' },
        ],
        executionHints: {
          smartContractABI: '[]',
          paymentInstructions: 'Bank details here',
        },
      });

      interfaceId = interfaceResult.interfaceId!;
    });

    it('should generate blockchain instructions for payment claim', () => {
      const result = capitalizationManager.generateBlockchainInstructions(interfaceId);

      expect(result.success).toBe(true);
      expect(result.instructions?.functionName).toBe('transferPayment');
      expect(result.instructions?.parameters.beneficiaries).toHaveLength(2);
      expect(result.instructions?.contractAddress).toBe('0x1234567890abcdef');
    });

    it('should generate payment instructions', () => {
      const result = capitalizationManager.generatePaymentInstructions(interfaceId);

      expect(result.success).toBe(true);
      expect(result.instructions?.beneficiaries).toHaveLength(2);
      expect(result.instructions?.reference).toContain('SETTLEMENT-');
      expect(result.instructions?.paymentMethod).toBeDefined();
    });

    it('should generate accounting entries', () => {
      const result = capitalizationManager.generateAccountingEntries(interfaceId);

      expect(result.success).toBe(true);
      expect(result.entries).toBeDefined();
      expect(result.entries!.length).toBeGreaterThan(0);

      const debitEntry = result.entries!.find((e) => e.debit);
      const creditEntry = result.entries!.find((e) => e.credit);

      expect(debitEntry).toBeDefined();
      expect(creditEntry).toBeDefined();
    });

    it('should reject payment instructions for non-payment interfaces', () => {
      const eventResult = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'equity_interest',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const interfaceResult = capitalizationManager.generateCapitalizationInterface({
        settlementId: finalizedSettlementId,
        eventId: eventResult.eventId!,
        valueType: 'equity_interest',
        beneficiaries: [{ partyId: 'party-1', percentage: 100 }],
      });

      const result = capitalizationManager.generatePaymentInstructions(
        interfaceResult.interfaceId!
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a payment claim');
    });
  });

  describe('Query Methods', () => {
    it('should query events by settlement', () => {
      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'revenue_share',
        formula: '10%',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
      });

      const events = capitalizationManager.getEventsBySettlement(finalizedSettlementId);
      expect(events).toHaveLength(2);
    });

    it('should query events by value type', () => {
      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '20000',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
      });

      const paymentEvents = capitalizationManager.getEventsByValueType('payment_claim');
      expect(paymentEvents).toHaveLength(2);
    });

    it('should query events by beneficiary', () => {
      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1', 'party-2'],
        issuedBy: 'party-1',
      });

      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'revenue_share',
        formula: '10%',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const eventsForParty1 = capitalizationManager.getEventsByBeneficiary('party-1');
      expect(eventsForParty1).toHaveLength(2);

      const eventsForParty2 = capitalizationManager.getEventsByBeneficiary('party-2');
      expect(eventsForParty2).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive statistics', () => {
      capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const event2 = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'revenue_share',
        formula: '10%',
        beneficiaries: ['party-2'],
        issuedBy: 'party-1',
      });

      capitalizationManager.recordExecution(event2.eventId!, {
        executedAt: Date.now(),
        status: 'confirmed',
      });

      const stats = capitalizationManager.getStats();

      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByValueType.payment_claim).toBe(1);
      expect(stats.eventsByValueType.revenue_share).toBe(1);
      expect(stats.executedEvents).toBe(1);
      expect(stats.confirmedExecutions).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('should persist events to disk', () => {
      const result = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const filePath = `${testDataPath}/events/${result.eventId}.json`;
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should load events from disk on initialization', () => {
      const result = capitalizationManager.createCapitalizationEvent({
        settlementId: finalizedSettlementId,
        valueType: 'payment_claim',
        amount: '10000',
        beneficiaries: ['party-1'],
        issuedBy: 'party-1',
      });

      const newManager = new MP05CapitalizationManager(
        config,
        testDataPath,
        settlementManager
      );

      const loaded = newManager.getEvent(result.eventId!);
      expect(loaded).toBeDefined();
      expect(loaded?.amount).toBe('10000');
    });
  });
});
