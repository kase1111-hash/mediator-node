import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  MediatorConfig,
  CapitalizationEvent,
  CapitalizationInterface,
  ValueType,
  Settlement,
} from '../types';
import { MP05SettlementManager } from './MP05SettlementManager';

/**
 * MP-05 Phase 2: Capitalization Manager
 * Handles transformation of finalized settlements into value instruments
 * and interfaces for external systems (blockchain, payment, accounting)
 */

export interface CapitalizationEventParams {
  settlementId: string;
  valueType: ValueType;
  amount?: string;
  formula?: string;
  rights?: string[];
  conditions?: string[];
  beneficiaries: string[];
  issuedBy: string;
  externalReferences?: {
    blockchain?: string;
    contractAddress?: string;
    transactionHash?: string;
    legalInstrument?: string;
    accountingReference?: string;
  };
}

export interface CapitalizationInterfaceParams {
  settlementId: string;
  eventId: string;
  valueType: ValueType;
  amount?: string;
  currency?: string;
  beneficiaries: {
    partyId: string;
    percentage?: number;
    amount?: string;
    rights?: string[];
  }[];
  conditions?: {
    type: string;
    description: string;
    dueDate?: number;
  }[];
  executionHints?: {
    smartContractABI?: string;
    paymentInstructions?: string;
    legalTemplate?: string;
  };
}

export interface ExecutionMetadata {
  eventId: string;
  executedAt: number;
  executedBy?: string;
  transactionHash?: string;
  confirmations?: number;
  status: 'pending' | 'confirmed' | 'failed';
  errorMessage?: string;
}

export class MP05CapitalizationManager {
  private config: MediatorConfig;
  private dataPath: string;
  private eventsPath: string;
  private interfacesPath: string;
  private executionPath: string;
  private settlementManager: MP05SettlementManager;

  // In-memory caches
  private events: Map<string, CapitalizationEvent> = new Map();
  private interfaces: Map<string, CapitalizationInterface> = new Map();
  private executionMetadata: Map<string, ExecutionMetadata> = new Map();

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/mp05-capitalization',
    settlementManager: MP05SettlementManager
  ) {
    this.config = config;
    this.dataPath = dataPath;
    this.eventsPath = path.join(dataPath, 'events');
    this.interfacesPath = path.join(dataPath, 'interfaces');
    this.executionPath = path.join(dataPath, 'execution');
    this.settlementManager = settlementManager;

    // Ensure directories exist
    [this.dataPath, this.eventsPath, this.interfacesPath, this.executionPath].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Load existing data
    this.loadEvents();
    this.loadInterfaces();
    this.loadExecutionMetadata();
  }

  /**
   * Create a capitalization event from a finalized settlement
   */
  public createCapitalizationEvent(
    params: CapitalizationEventParams
  ): {
    success: boolean;
    eventId?: string;
    error?: string;
  } {
    // Validate capitalization is enabled
    if (!this.config.enableCapitalization) {
      return {
        success: false,
        error: 'Capitalization system is not enabled in configuration',
      };
    }

    // Validate settlement exists and is finalized
    const settlement = this.settlementManager.getSettlement(params.settlementId);
    if (!settlement) {
      return {
        success: false,
        error: `Settlement ${params.settlementId} not found`,
      };
    }

    if (settlement.status !== 'finalized') {
      return {
        success: false,
        error: `Settlement ${params.settlementId} must be finalized before capitalization (current status: ${settlement.status})`,
      };
    }

    // Validate required fields
    if (!params.valueType) {
      return { success: false, error: 'Value type is required' };
    }

    if (!params.beneficiaries || params.beneficiaries.length === 0) {
      return { success: false, error: 'At least one beneficiary is required' };
    }

    if (!params.issuedBy) {
      return { success: false, error: 'Issuer ID is required' };
    }

    // Validate beneficiaries are settlement parties
    const settlementParties = settlement.requiredParties;
    const invalidBeneficiaries = params.beneficiaries.filter(
      (b) => !settlementParties.includes(b)
    );
    if (invalidBeneficiaries.length > 0) {
      return {
        success: false,
        error: `Beneficiaries must be parties to the settlement: ${invalidBeneficiaries.join(', ')}`,
      };
    }

    // Create event
    const eventId = this.generateEventId();
    const event: CapitalizationEvent = {
      eventId,
      settlementId: params.settlementId,
      valueType: params.valueType,
      amount: params.amount,
      formula: params.formula,
      rights: params.rights || [],
      conditions: params.conditions || [],
      beneficiaries: params.beneficiaries,
      issuedBy: params.issuedBy,
      externalReferences: params.externalReferences,
      createdAt: Date.now(),
      eventHash: '',
    };

    // Calculate hash
    event.eventHash = this.calculateEventHash(event);

    // Store event
    this.events.set(eventId, event);
    this.saveEvent(event);

    return { success: true, eventId };
  }

  /**
   * Generate a capitalization interface for external systems
   */
  public generateCapitalizationInterface(
    params: CapitalizationInterfaceParams
  ): {
    success: boolean;
    interfaceId?: string;
    error?: string;
  } {
    // Validate capitalization is enabled
    if (!this.config.enableCapitalization) {
      return {
        success: false,
        error: 'Capitalization system is not enabled in configuration',
      };
    }

    // Validate event exists
    const event = this.events.get(params.eventId);
    if (!event) {
      return {
        success: false,
        error: `Capitalization event ${params.eventId} not found`,
      };
    }

    // Validate settlement
    const settlement = this.settlementManager.getSettlement(params.settlementId);
    if (!settlement) {
      return {
        success: false,
        error: `Settlement ${params.settlementId} not found`,
      };
    }

    if (settlement.status !== 'finalized') {
      return {
        success: false,
        error: `Settlement ${params.settlementId} must be finalized`,
      };
    }

    // Validate event matches settlement
    if (event.settlementId !== params.settlementId) {
      return {
        success: false,
        error: `Event ${params.eventId} does not belong to settlement ${params.settlementId}`,
      };
    }

    // Validate beneficiaries
    if (!params.beneficiaries || params.beneficiaries.length === 0) {
      return { success: false, error: 'At least one beneficiary is required' };
    }

    // Validate percentage totals if provided
    const percentageTotal = params.beneficiaries.reduce(
      (sum, b) => sum + (b.percentage || 0),
      0
    );
    if (percentageTotal > 0 && Math.abs(percentageTotal - 100) > 0.01) {
      return {
        success: false,
        error: `Beneficiary percentages must sum to 100% (got ${percentageTotal}%)`,
      };
    }

    // Create interface
    const interfaceId = this.generateInterfaceId();
    const capitalizationInterface: CapitalizationInterface = {
      interfaceId,
      settlementId: params.settlementId,
      eventId: params.eventId,
      valueType: params.valueType,
      amount: params.amount,
      currency: params.currency,
      beneficiaries: params.beneficiaries,
      conditions: params.conditions,
      upstreamReferences: {
        agreements: settlement.referencedAgreements,
        receipts: settlement.referencedReceipts,
        licenses: settlement.referencedLicenses,
      },
      executionHints: params.executionHints,
      createdAt: Date.now(),
      interfaceHash: '',
    };

    // Calculate hash
    capitalizationInterface.interfaceHash =
      this.calculateInterfaceHash(capitalizationInterface);

    // Store interface
    this.interfaces.set(interfaceId, capitalizationInterface);
    this.saveInterface(capitalizationInterface);

    return { success: true, interfaceId };
  }

  /**
   * Record execution of a capitalization event
   */
  public recordExecution(
    eventId: string,
    metadata: Omit<ExecutionMetadata, 'eventId'>
  ): {
    success: boolean;
    error?: string;
  } {
    const event = this.events.get(eventId);
    if (!event) {
      return {
        success: false,
        error: `Capitalization event ${eventId} not found`,
      };
    }

    // Update event execution timestamp
    event.executedAt = metadata.executedAt;
    this.saveEvent(event);

    // Store execution metadata
    const execution: ExecutionMetadata = {
      eventId,
      ...metadata,
    };
    this.executionMetadata.set(eventId, execution);
    this.saveExecutionMetadata(execution);

    return { success: true };
  }

  /**
   * Get capitalization event by ID
   */
  public getEvent(eventId: string): CapitalizationEvent | undefined {
    return this.events.get(eventId);
  }

  /**
   * Get capitalization interface by ID
   */
  public getInterface(interfaceId: string): CapitalizationInterface | undefined {
    return this.interfaces.get(interfaceId);
  }

  /**
   * Get execution metadata for an event
   */
  public getExecutionMetadata(eventId: string): ExecutionMetadata | undefined {
    return this.executionMetadata.get(eventId);
  }

  /**
   * Get all events for a settlement
   */
  public getEventsBySettlement(settlementId: string): CapitalizationEvent[] {
    return Array.from(this.events.values()).filter(
      (e) => e.settlementId === settlementId
    );
  }

  /**
   * Get all interfaces for a settlement
   */
  public getInterfacesBySettlement(
    settlementId: string
  ): CapitalizationInterface[] {
    return Array.from(this.interfaces.values()).filter(
      (i) => i.settlementId === settlementId
    );
  }

  /**
   * Get events by value type
   */
  public getEventsByValueType(valueType: ValueType): CapitalizationEvent[] {
    return Array.from(this.events.values()).filter(
      (e) => e.valueType === valueType
    );
  }

  /**
   * Get events by beneficiary
   */
  public getEventsByBeneficiary(partyId: string): CapitalizationEvent[] {
    return Array.from(this.events.values()).filter((e) =>
      e.beneficiaries.includes(partyId)
    );
  }

  /**
   * Get pending executions
   */
  public getPendingExecutions(): ExecutionMetadata[] {
    return Array.from(this.executionMetadata.values()).filter(
      (m) => m.status === 'pending'
    );
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalEvents: number;
    eventsByValueType: Record<ValueType, number>;
    executedEvents: number;
    totalInterfaces: number;
    pendingExecutions: number;
    confirmedExecutions: number;
    failedExecutions: number;
  } {
    const eventsByValueType: Record<ValueType, number> = {
      payment_claim: 0,
      revenue_share: 0,
      equity_interest: 0,
      token: 0,
      contractual_right: 0,
      other: 0,
    };

    let executedEvents = 0;

    for (const event of this.events.values()) {
      eventsByValueType[event.valueType]++;
      if (event.executedAt) {
        executedEvents++;
      }
    }

    const pendingExecutions = Array.from(this.executionMetadata.values()).filter(
      (m) => m.status === 'pending'
    ).length;

    const confirmedExecutions = Array.from(this.executionMetadata.values()).filter(
      (m) => m.status === 'confirmed'
    ).length;

    const failedExecutions = Array.from(this.executionMetadata.values()).filter(
      (m) => m.status === 'failed'
    ).length;

    return {
      totalEvents: this.events.size,
      eventsByValueType,
      executedEvents,
      totalInterfaces: this.interfaces.size,
      pendingExecutions,
      confirmedExecutions,
      failedExecutions,
    };
  }

  /**
   * Generate blockchain execution instructions
   */
  public generateBlockchainInstructions(interfaceId: string): {
    success: boolean;
    instructions?: {
      contractAddress?: string;
      abi?: string;
      functionName: string;
      parameters: Record<string, any>;
      value?: string;
    };
    error?: string;
  } {
    const iface = this.interfaces.get(interfaceId);
    if (!iface) {
      return {
        success: false,
        error: `Interface ${interfaceId} not found`,
      };
    }

    const event = this.events.get(iface.eventId);
    if (!event) {
      return {
        success: false,
        error: `Event ${iface.eventId} not found`,
      };
    }

    // Generate instructions based on value type
    let functionName = '';
    const parameters: Record<string, any> = {};

    switch (iface.valueType) {
      case 'payment_claim':
        functionName = 'transferPayment';
        parameters.beneficiaries = iface.beneficiaries.map((b) => ({
          address: b.partyId,
          amount: b.amount || '0',
        }));
        parameters.settlementId = iface.settlementId;
        break;

      case 'token':
        functionName = 'mintTokens';
        parameters.beneficiaries = iface.beneficiaries.map((b) => ({
          address: b.partyId,
          amount: b.amount || '0',
        }));
        parameters.settlementId = iface.settlementId;
        break;

      case 'equity_interest':
        functionName = 'issueEquity';
        parameters.beneficiaries = iface.beneficiaries.map((b) => ({
          address: b.partyId,
          percentage: b.percentage || 0,
          rights: b.rights || [],
        }));
        parameters.settlementId = iface.settlementId;
        break;

      case 'revenue_share':
        functionName = 'createRevenueShare';
        parameters.beneficiaries = iface.beneficiaries.map((b) => ({
          address: b.partyId,
          percentage: b.percentage || 0,
        }));
        parameters.conditions = iface.conditions || [];
        parameters.settlementId = iface.settlementId;
        break;

      case 'contractual_right':
        functionName = 'grantRights';
        parameters.beneficiaries = iface.beneficiaries.map((b) => ({
          address: b.partyId,
          rights: b.rights || [],
        }));
        parameters.settlementId = iface.settlementId;
        break;

      default:
        functionName = 'recordSettlement';
        parameters.settlementId = iface.settlementId;
        parameters.eventId = iface.eventId;
    }

    return {
      success: true,
      instructions: {
        contractAddress: event.externalReferences?.contractAddress,
        abi: iface.executionHints?.smartContractABI,
        functionName,
        parameters,
        value: iface.amount,
      },
    };
  }

  /**
   * Generate payment instructions
   */
  public generatePaymentInstructions(interfaceId: string): {
    success: boolean;
    instructions?: {
      paymentMethod: string;
      beneficiaries: {
        partyId: string;
        amount: string;
        currency?: string;
        accountDetails?: string;
      }[];
      reference: string;
      dueDate?: number;
    };
    error?: string;
  } {
    const iface = this.interfaces.get(interfaceId);
    if (!iface) {
      return {
        success: false,
        error: `Interface ${interfaceId} not found`,
      };
    }

    if (iface.valueType !== 'payment_claim') {
      return {
        success: false,
        error: `Interface ${interfaceId} is not a payment claim`,
      };
    }

    return {
      success: true,
      instructions: {
        paymentMethod: iface.executionHints?.paymentInstructions || 'wire_transfer',
        beneficiaries: iface.beneficiaries.map((b) => ({
          partyId: b.partyId,
          amount: b.amount || '0',
          currency: iface.currency,
          accountDetails: iface.executionHints?.paymentInstructions,
        })),
        reference: `SETTLEMENT-${iface.settlementId}`,
        dueDate: iface.conditions?.find((c) => c.dueDate)?.dueDate,
      },
    };
  }

  /**
   * Generate accounting journal entries
   */
  public generateAccountingEntries(interfaceId: string): {
    success: boolean;
    entries?: Array<{
      date: number;
      account: string;
      debit?: string;
      credit?: string;
      description: string;
      reference: string;
    }>;
    error?: string;
  } {
    const iface = this.interfaces.get(interfaceId);
    if (!iface) {
      return {
        success: false,
        error: `Interface ${interfaceId} not found`,
      };
    }

    const event = this.events.get(iface.eventId);
    if (!event) {
      return {
        success: false,
        error: `Event ${iface.eventId} not found`,
      };
    }

    const entries: Array<{
      date: number;
      account: string;
      debit?: string;
      credit?: string;
      description: string;
      reference: string;
    }> = [];

    const reference =
      event.externalReferences?.accountingReference || iface.settlementId;

    // Generate entries based on value type
    switch (iface.valueType) {
      case 'payment_claim':
        // Debit: Accounts Receivable / Credit: Revenue or Settlement Liability
        entries.push({
          date: iface.createdAt,
          account: 'Accounts Receivable',
          debit: iface.amount || '0',
          description: `Settlement payment claim - ${iface.settlementId}`,
          reference,
        });
        entries.push({
          date: iface.createdAt,
          account: 'Settlement Revenue',
          credit: iface.amount || '0',
          description: `Settlement payment claim - ${iface.settlementId}`,
          reference,
        });
        break;

      case 'revenue_share':
        // Debit: Revenue Share Expense / Credit: Revenue Share Payable
        entries.push({
          date: iface.createdAt,
          account: 'Revenue Share Expense',
          debit: iface.amount || '0',
          description: `Revenue share agreement - ${iface.settlementId}`,
          reference,
        });
        entries.push({
          date: iface.createdAt,
          account: 'Revenue Share Payable',
          credit: iface.amount || '0',
          description: `Revenue share agreement - ${iface.settlementId}`,
          reference,
        });
        break;

      case 'equity_interest':
        // Debit: Equity Issuance / Credit: Common Stock
        entries.push({
          date: iface.createdAt,
          account: 'Equity Issuance Expense',
          debit: iface.amount || '0',
          description: `Equity interest settlement - ${iface.settlementId}`,
          reference,
        });
        entries.push({
          date: iface.createdAt,
          account: 'Common Stock',
          credit: iface.amount || '0',
          description: `Equity interest settlement - ${iface.settlementId}`,
          reference,
        });
        break;

      default:
        // Generic settlement entry
        entries.push({
          date: iface.createdAt,
          account: 'Settlement Assets',
          debit: iface.amount || '0',
          description: `Settlement capitalization - ${iface.settlementId}`,
          reference,
        });
        entries.push({
          date: iface.createdAt,
          account: 'Settlement Obligations',
          credit: iface.amount || '0',
          description: `Settlement capitalization - ${iface.settlementId}`,
          reference,
        });
    }

    return { success: true, entries };
  }

  // Private helper methods

  private generateEventId(): string {
    return `cap-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInterfaceId(): string {
    return `cap-iface-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateEventHash(event: CapitalizationEvent): string {
    const dataToHash = {
      settlementId: event.settlementId,
      valueType: event.valueType,
      amount: event.amount,
      formula: event.formula,
      rights: event.rights,
      conditions: event.conditions,
      beneficiaries: event.beneficiaries,
      issuedBy: event.issuedBy,
      createdAt: event.createdAt,
    };
    return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
  }

  private calculateInterfaceHash(iface: CapitalizationInterface): string {
    const dataToHash = {
      settlementId: iface.settlementId,
      eventId: iface.eventId,
      valueType: iface.valueType,
      amount: iface.amount,
      currency: iface.currency,
      beneficiaries: iface.beneficiaries,
      conditions: iface.conditions,
      upstreamReferences: iface.upstreamReferences,
      createdAt: iface.createdAt,
    };
    return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
  }

  private saveEvent(event: CapitalizationEvent): void {
    if (!fs.existsSync(this.eventsPath)) {
      fs.mkdirSync(this.eventsPath, { recursive: true });
    }
    const filePath = path.join(this.eventsPath, `${event.eventId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(event, null, 2));
  }

  private saveInterface(iface: CapitalizationInterface): void {
    if (!fs.existsSync(this.interfacesPath)) {
      fs.mkdirSync(this.interfacesPath, { recursive: true });
    }
    const filePath = path.join(this.interfacesPath, `${iface.interfaceId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(iface, null, 2));
  }

  private saveExecutionMetadata(metadata: ExecutionMetadata): void {
    if (!fs.existsSync(this.executionPath)) {
      fs.mkdirSync(this.executionPath, { recursive: true });
    }
    const filePath = path.join(this.executionPath, `${metadata.eventId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  }

  private loadEvents(): void {
    if (!fs.existsSync(this.eventsPath)) return;

    const files = fs.readdirSync(this.eventsPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.eventsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const event: CapitalizationEvent = JSON.parse(content);
      this.events.set(event.eventId, event);
    }
  }

  private loadInterfaces(): void {
    if (!fs.existsSync(this.interfacesPath)) return;

    const files = fs.readdirSync(this.interfacesPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.interfacesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const iface: CapitalizationInterface = JSON.parse(content);
      this.interfaces.set(iface.interfaceId, iface);
    }
  }

  private loadExecutionMetadata(): void {
    if (!fs.existsSync(this.executionPath)) return;

    const files = fs.readdirSync(this.executionPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.executionPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const metadata: ExecutionMetadata = JSON.parse(content);
      this.executionMetadata.set(metadata.eventId, metadata);
    }
  }
}
