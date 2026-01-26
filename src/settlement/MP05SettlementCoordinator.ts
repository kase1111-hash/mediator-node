import { MediatorConfig, Settlement, CapitalizationEvent, CapitalizationInterface } from '../types';
import { EffortCaptureSystem } from '../effort/EffortCaptureSystem';
import { DisputeManager } from '../dispute/DisputeManager';
import { LicensingManager } from '../licensing/LicensingManager';
import { MP05SettlementValidator } from './MP05SettlementValidator';
import {
  MP05SettlementManager,
  SettlementInitiationParams,
  SettlementDeclarationParams,
  StageCompletionParams,
} from './MP05SettlementManager';
import {
  MP05CapitalizationManager,
  CapitalizationEventParams,
  CapitalizationInterfaceParams,
  ExecutionMetadata,
} from './MP05CapitalizationManager';

/**
 * MP-05 Settlement & Capitalization Coordinator
 * Main orchestrator for the settlement and capitalization system
 * Provides unified API and workflow management
 */

export class MP05SettlementCoordinator {
  private config: MediatorConfig;
  private validator: MP05SettlementValidator;
  private settlementManager: MP05SettlementManager;
  private capitalizationManager: MP05CapitalizationManager;

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/mp05',
    effortCaptureSystem?: EffortCaptureSystem,
    disputeManager?: DisputeManager,
    licensingManager?: LicensingManager
  ) {
    this.config = config;

    // Initialize components
    this.validator = new MP05SettlementValidator(
      config,
      effortCaptureSystem,
      disputeManager,
      licensingManager
    );

    this.settlementManager = new MP05SettlementManager(
      config,
      `${dataPath}/settlements`,
      this.validator
    );

    this.capitalizationManager = new MP05CapitalizationManager(
      config,
      `${dataPath}/capitalization`,
      this.settlementManager
    );
  }

  /**
   * Get validator instance
   */
  public getValidator(): MP05SettlementValidator {
    return this.validator;
  }

  /**
   * Get settlement manager instance
   */
  public getSettlementManager(): MP05SettlementManager {
    return this.settlementManager;
  }

  /**
   * Get capitalization manager instance
   */
  public getCapitalizationManager(): MP05CapitalizationManager {
    return this.capitalizationManager;
  }

  // ============================================================================
  // Settlement Lifecycle Methods
  // ============================================================================

  /**
   * Initiate a new settlement
   */
  public initiateSettlement(params: SettlementInitiationParams): {
    success: boolean;
    settlementId?: string;
    error?: string;
    warnings?: string[];
  } {
    return this.settlementManager.initiateSettlement(params);
  }

  /**
   * Record a party's settlement declaration
   */
  public declareSettlement(params: SettlementDeclarationParams): {
    success: boolean;
    declarationId?: string;
    ratified?: boolean;
    error?: string;
  } {
    return this.settlementManager.declareSettlement(params);
  }

  /**
   * Finalize a settlement (make immutable)
   */
  public finalizeSettlement(settlementId: string): {
    success: boolean;
    error?: string;
  } {
    return this.settlementManager.finalizeSettlement(settlementId);
  }

  /**
   * Complete a settlement stage (for staged settlements)
   */
  public completeStage(params: StageCompletionParams): {
    success: boolean;
    error?: string;
  } {
    return this.settlementManager.completeStage(params);
  }

  /**
   * Contest a settlement (link to MP-03 dispute)
   */
  public contestSettlement(settlementId: string, disputeId: string): {
    success: boolean;
    error?: string;
  } {
    return this.settlementManager.contestSettlement(settlementId, disputeId);
  }

  /**
   * Reverse a settlement
   */
  public reverseSettlement(settlementId: string, reversalSettlementId: string): {
    success: boolean;
    error?: string;
  } {
    return this.settlementManager.reverseSettlement(settlementId, reversalSettlementId);
  }

  // ============================================================================
  // Capitalization Methods
  // ============================================================================

  /**
   * Create a capitalization event from a finalized settlement
   */
  public createCapitalizationEvent(params: CapitalizationEventParams): {
    success: boolean;
    eventId?: string;
    error?: string;
  } {
    return this.capitalizationManager.createCapitalizationEvent(params);
  }

  /**
   * Generate a capitalization interface for external systems
   */
  public generateCapitalizationInterface(params: CapitalizationInterfaceParams): {
    success: boolean;
    interfaceId?: string;
    error?: string;
  } {
    return this.capitalizationManager.generateCapitalizationInterface(params);
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
    return this.capitalizationManager.recordExecution(eventId, metadata);
  }

  // ============================================================================
  // Complete Workflow Methods
  // ============================================================================

  /**
   * Complete workflow: Initiate settlement, declare, ratify, finalize, and capitalize
   * This is a convenience method that handles the full lifecycle
   */
  public completeSettlementWorkflow(params: {
    settlement: SettlementInitiationParams;
    declarations: Omit<SettlementDeclarationParams, 'settlementId'>[];
    capitalization?: Omit<CapitalizationEventParams, 'settlementId'>;
    generateInterface?: boolean;
  }): {
    success: boolean;
    settlementId?: string;
    eventId?: string;
    interfaceId?: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Initiate settlement
    const initiationResult = this.settlementManager.initiateSettlement(params.settlement);
    if (!initiationResult.success) {
      errors.push(`Settlement initiation failed: ${initiationResult.error}`);
      return { success: false, errors, warnings };
    }

    const settlementId = initiationResult.settlementId!;
    if (initiationResult.warnings) {
      warnings.push(...initiationResult.warnings);
    }

    // Step 2: Record all party declarations
    let ratified = false;
    for (const declaration of params.declarations) {
      const declarationResult = this.settlementManager.declareSettlement({
        ...declaration,
        settlementId,
      });

      if (!declarationResult.success) {
        errors.push(`Declaration failed for ${declaration.declaringPartyId}: ${declarationResult.error}`);
      } else {
        ratified = declarationResult.ratified || false;
      }
    }

    if (!ratified) {
      warnings.push('Settlement not yet ratified - not all required parties have declared');
    }

    // Step 3: Finalize settlement
    const finalizationResult = this.settlementManager.finalizeSettlement(settlementId);
    if (!finalizationResult.success) {
      errors.push(`Settlement finalization failed: ${finalizationResult.error}`);
      return { success: false, settlementId, errors, warnings };
    }

    // Step 4: Optionally create capitalization event
    let eventId: string | undefined;
    let interfaceId: string | undefined;

    if (params.capitalization) {
      const eventResult = this.capitalizationManager.createCapitalizationEvent({
        ...params.capitalization,
        settlementId,
      });

      if (!eventResult.success) {
        errors.push(`Capitalization event creation failed: ${eventResult.error}`);
      } else {
        eventId = eventResult.eventId;

        // Step 5: Optionally generate interface
        if (params.generateInterface) {
          const interfaceResult = this.capitalizationManager.generateCapitalizationInterface({
            settlementId,
            eventId: eventId!,
            valueType: params.capitalization.valueType,
            amount: params.capitalization.amount,
            beneficiaries: params.capitalization.beneficiaries.map((b) => ({
              partyId: b,
              amount: params.capitalization!.amount,
            })),
          });

          if (!interfaceResult.success) {
            errors.push(`Interface generation failed: ${interfaceResult.error}`);
          } else {
            interfaceId = interfaceResult.interfaceId;
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      settlementId,
      eventId,
      interfaceId,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get settlement by ID
   */
  public getSettlement(settlementId: string): Settlement | undefined {
    return this.settlementManager.getSettlement(settlementId);
  }

  /**
   * Get capitalization event by ID
   */
  public getCapitalizationEvent(eventId: string): CapitalizationEvent | undefined {
    return this.capitalizationManager.getEvent(eventId);
  }

  /**
   * Get capitalization interface by ID
   */
  public getCapitalizationInterface(interfaceId: string): CapitalizationInterface | undefined {
    return this.capitalizationManager.getInterface(interfaceId);
  }

  /**
   * Get all settlements for a party
   */
  public getSettlementsByParty(partyId: string): Settlement[] {
    return this.settlementManager.getSettlementsByParty(partyId);
  }

  /**
   * Get all capitalization events for a settlement
   */
  public getCapitalizationEventsBySettlement(settlementId: string): CapitalizationEvent[] {
    return this.capitalizationManager.getEventsBySettlement(settlementId);
  }

  /**
   * Get all capitalization interfaces for a settlement
   */
  public getCapitalizationInterfacesBySettlement(
    settlementId: string
  ): CapitalizationInterface[] {
    return this.capitalizationManager.getInterfacesBySettlement(settlementId);
  }

  // ============================================================================
  // External System Integration Methods
  // ============================================================================

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
    return this.capitalizationManager.generateBlockchainInstructions(interfaceId);
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
    return this.capitalizationManager.generatePaymentInstructions(interfaceId);
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
    return this.capitalizationManager.generateAccountingEntries(interfaceId);
  }

  // ============================================================================
  // Statistics and Reporting
  // ============================================================================

  /**
   * Get comprehensive statistics
   */
  public getStats(): {
    settlements: {
      totalSettlements: number;
      settlementsByStatus: Record<string, number>;
      stagedSettlements: number;
      finalizedSettlements: number;
      contestedSettlements: number;
      totalRisks: number;
      risksBySeverity: Record<string, number>;
    };
    capitalization: {
      totalEvents: number;
      eventsByValueType: Record<string, number>;
      executedEvents: number;
      totalInterfaces: number;
      pendingExecutions: number;
      confirmedExecutions: number;
      failedExecutions: number;
    };
  } {
    return {
      settlements: this.settlementManager.getStats(),
      capitalization: this.capitalizationManager.getStats(),
    };
  }

  /**
   * Get settlement summary with capitalization info
   */
  public getSettlementSummary(settlementId: string): {
    settlement?: Settlement;
    events: CapitalizationEvent[];
    interfaces: CapitalizationInterface[];
    risks: any[];
  } {
    const settlement = this.settlementManager.getSettlement(settlementId);
    const events = this.capitalizationManager.getEventsBySettlement(settlementId);
    const interfaces = this.capitalizationManager.getInterfacesBySettlement(settlementId);
    const risks = this.settlementManager.getRisksForSettlement(settlementId);

    return {
      settlement,
      events,
      interfaces,
      risks,
    };
  }

  /**
   * Validate preconditions for a potential settlement
   */
  public validatePreconditions(params: {
    referencedAgreements: string[];
    referencedReceipts: string[];
    referencedLicenses?: string[];
    referencedDelegations?: string[];
    declaringPartyId: string;
  }): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    return this.validator.validatePreconditions(params);
  }
}
