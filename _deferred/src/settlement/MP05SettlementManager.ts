import {
  MediatorConfig,
  Settlement,
  SettlementDeclaration,
  MP05SettlementStatus,
  SettlementStage,
  SettlementRisk,
} from '../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { MP05SettlementValidator } from './MP05SettlementValidator';

/**
 * Parameters for initiating a settlement
 */
export interface SettlementInitiationParams {
  initiatedBy: string;
  requiredParties: string[];
  referencedAgreements: string[];
  referencedReceipts: string[];
  referencedLicenses?: string[];
  referencedDelegations?: string[];
  settlementStatement: string;
  valueDescription?: string;
  isStaged?: boolean;
  stages?: Omit<SettlementStage, 'stageId' | 'completedAt' | 'completedBy'>[];
}

/**
 * Parameters for declaring settlement (individual party)
 */
export interface SettlementDeclarationParams {
  settlementId: string;
  declaringPartyId: string;
  declarationStatement: string;
  referencedAgreements: string[];
  referencedReceipts: string[];
  referencedLicenses?: string[];
  valueDescription?: string;
  humanAuthorship: boolean;
  signature?: string;
}

/**
 * Parameters for completing a settlement stage
 */
export interface StageCompletionParams {
  settlementId: string;
  stageNumber: number;
  completedBy: string;
}

/**
 * Manages MP-05 settlement lifecycle
 * Implements human-ratified settlement declarations with upstream artifact validation
 */
export class MP05SettlementManager {
  private config: MediatorConfig;
  private settlements: Map<string, Settlement> = new Map();
  private risks: Map<string, SettlementRisk> = new Map();
  private dataPath: string;
  private risksPath: string;
  private validator: MP05SettlementValidator;

  constructor(
    config: MediatorConfig,
    dataPath: string = './data/mp05-settlements',
    validator: MP05SettlementValidator
  ) {
    this.config = config;
    this.dataPath = dataPath;
    this.risksPath = path.join(dataPath, 'risks');
    this.validator = validator;

    // Ensure data directories exist
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.risksPath)) {
      fs.mkdirSync(this.risksPath, { recursive: true });
    }

    // Load existing settlements and risks
    this.loadSettlements();
    this.loadRisks();

    logger.info('MP05SettlementManager initialized', {
      dataPath,
      settlementsLoaded: this.settlements.size,
      risksLoaded: this.risks.size,
    });
  }

  /**
   * Initiate a new settlement
   */
  public initiateSettlement(params: SettlementInitiationParams): {
    success: boolean;
    settlementId?: string;
    error?: string;
    warnings?: string[];
  } {
    try {
      // Check if settlement system is enabled
      if (!this.config.enableSettlementSystem) {
        return {
          success: false,
          error: 'Settlement system is not enabled in configuration',
        };
      }

      // Validate required fields
      if (!params.initiatedBy) {
        return { success: false, error: 'Initiating party is required' };
      }

      if (!params.requiredParties || params.requiredParties.length === 0) {
        return { success: false, error: 'At least one required party must be specified' };
      }

      if (!params.settlementStatement || params.settlementStatement.trim().length === 0) {
        return { success: false, error: 'Settlement statement is required' };
      }

      if (params.referencedAgreements.length === 0 && params.referencedReceipts.length === 0) {
        return {
          success: false,
          error: 'At least one referenced agreement or receipt is required',
        };
      }

      // Validate preconditions
      const validation = this.validator.validatePreconditions({
        referencedAgreements: params.referencedAgreements,
        referencedReceipts: params.referencedReceipts,
        referencedLicenses: params.referencedLicenses,
        referencedDelegations: params.referencedDelegations,
        declaringPartyId: params.initiatedBy,
      });

      // Record risks if validation failed
      const settlementId = nanoid();
      if (!validation.valid && this.config.enableRiskTracking) {
        this.recordRisk({
          settlementId,
          riskType: 'premature_settlement',
          description: `Settlement initiated with validation errors: ${validation.errors.join(', ')}`,
          severity: 'high',
          evidence: validation.errors,
        });
      }

      const now = Date.now();

      // Prepare stages if staged settlement
      let stages: SettlementStage[] | undefined;
      if (params.isStaged && params.stages) {
        stages = params.stages.map((stage, index) => ({
          stageId: nanoid(),
          stageNumber: index + 1,
          description: stage.description,
          completionCriteria: stage.completionCriteria,
          valuePercentage: stage.valuePercentage,
        }));
      }

      const settlement: Settlement = {
        settlementId,
        status: 'declared',
        referencedAgreements: params.referencedAgreements,
        referencedReceipts: params.referencedReceipts,
        referencedLicenses: params.referencedLicenses,
        referencedDelegations: params.referencedDelegations,
        requiredParties: params.requiredParties,
        declarations: [],
        settlementStatement: params.settlementStatement,
        valueDescription: params.valueDescription,
        initiatedAt: now,
        initiatedBy: params.initiatedBy,
        isStaged: params.isStaged || false,
        stages,
        currentStage: params.isStaged ? 0 : undefined, // 0 = no stages completed yet
        settlementHash: '', // Will be calculated after first declaration
        immutable: false,
      };

      // Store settlement
      this.settlements.set(settlementId, settlement);
      this.saveSettlement(settlement);

      logger.info('Settlement initiated', {
        settlementId,
        initiatedBy: params.initiatedBy,
        requiredParties: params.requiredParties.length,
        isStaged: params.isStaged,
        validationErrors: validation.errors.length,
      });

      return {
        success: true,
        settlementId,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      };
    } catch (error) {
      logger.error('Error initiating settlement', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Record a settlement declaration by a party
   */
  public declareSettlement(params: SettlementDeclarationParams): {
    success: boolean;
    declarationId?: string;
    ratified?: boolean; // True if all parties have now declared
    error?: string;
  } {
    try {
      const settlement = this.settlements.get(params.settlementId);

      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      // Check if settlement is immutable
      if (settlement.immutable) {
        return { success: false, error: 'Settlement is immutable and cannot accept new declarations' };
      }

      // Validate party authorization
      if (!this.validator.validatePartyAuthorization(params.declaringPartyId, settlement.requiredParties)) {
        this.recordRisk({
          settlementId: params.settlementId,
          riskType: 'unauthorized_declaration',
          description: `Unauthorized declaration by ${params.declaringPartyId}`,
          severity: 'high',
          evidence: [params.declaringPartyId],
        });

        return {
          success: false,
          error: 'Declaring party is not authorized for this settlement',
        };
      }

      // Check if party has already declared
      if (settlement.declarations.some((d) => d.declaringPartyId === params.declaringPartyId)) {
        return {
          success: false,
          error: 'Party has already declared settlement',
        };
      }

      // Validate human authorship if required
      if (this.config.requireHumanRatification && !params.humanAuthorship) {
        return {
          success: false,
          error: 'Human authorship is required for settlement declarations',
        };
      }

      const declarationId = nanoid();
      const now = Date.now();

      const declaration: SettlementDeclaration = {
        declarationId,
        settlementId: params.settlementId,
        declaringPartyId: params.declaringPartyId,
        declarationStatement: params.declarationStatement,
        referencedAgreements: params.referencedAgreements,
        referencedReceipts: params.referencedReceipts,
        referencedLicenses: params.referencedLicenses,
        valueDescription: params.valueDescription,
        declaredAt: now,
        humanAuthorship: params.humanAuthorship,
        signature: params.signature,
        declarationHash: this.calculateDeclarationHash({
          declarationId,
          settlementId: params.settlementId,
          declaringPartyId: params.declaringPartyId,
          declarationStatement: params.declarationStatement,
          referencedAgreements: params.referencedAgreements,
          referencedReceipts: params.referencedReceipts,
          referencedLicenses: params.referencedLicenses,
          valueDescription: params.valueDescription,
          declaredAt: now,
          humanAuthorship: params.humanAuthorship,
          signature: params.signature,
        }),
      };

      // Add declaration
      settlement.declarations.push(declaration);

      // Check if all required parties have declared
      const allDeclared = settlement.requiredParties.every((partyId) =>
        settlement.declarations.some((d) => d.declaringPartyId === partyId)
      );

      let ratified = false;
      if (allDeclared) {
        settlement.status = 'ratified';
        settlement.ratifiedAt = now;
        settlement.settlementHash = this.calculateSettlementHash(settlement);
        ratified = true;

        logger.info('Settlement ratified - all parties declared', {
          settlementId: params.settlementId,
          parties: settlement.requiredParties.length,
        });
      } else {
        // Update hash even for partial declarations
        settlement.settlementHash = this.calculateSettlementHash(settlement);
      }

      this.saveSettlement(settlement);

      logger.info('Settlement declaration recorded', {
        settlementId: params.settlementId,
        declarationId,
        declaringParty: params.declaringPartyId,
        ratified,
      });

      return {
        success: true,
        declarationId,
        ratified,
      };
    } catch (error) {
      logger.error('Error recording settlement declaration', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Finalize a ratified settlement (make it immutable)
   */
  public finalizeSettlement(settlementId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const settlement = this.settlements.get(settlementId);

      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      if (settlement.status !== 'ratified') {
        return { success: false, error: 'Settlement must be ratified before finalization' };
      }

      if (settlement.immutable) {
        return { success: false, error: 'Settlement is already finalized' };
      }

      // If staged, check if all stages are completed
      if (settlement.isStaged && settlement.stages) {
        const incompletedStages = settlement.stages.filter((s) => !s.completedAt);
        if (incompletedStages.length > 0) {
          return {
            success: false,
            error: `Cannot finalize: ${incompletedStages.length} stage(s) still incomplete`,
          };
        }
      }

      settlement.status = 'finalized';
      settlement.finalizedAt = Date.now();
      settlement.immutable = true;
      settlement.settlementHash = this.calculateSettlementHash(settlement);

      this.saveSettlement(settlement);

      logger.info('Settlement finalized', {
        settlementId,
        finalizedAt: settlement.finalizedAt,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error finalizing settlement', { error });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Complete a settlement stage
   */
  public completeStage(params: StageCompletionParams): {
    success: boolean;
    error?: string;
  } {
    try {
      const settlement = this.settlements.get(params.settlementId);

      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      if (!settlement.isStaged || !settlement.stages) {
        return { success: false, error: 'Settlement is not staged' };
      }

      const stage = settlement.stages.find((s) => s.stageNumber === params.stageNumber);
      if (!stage) {
        return { success: false, error: `Stage ${params.stageNumber} not found` };
      }

      if (stage.completedAt) {
        return { success: false, error: `Stage ${params.stageNumber} is already completed` };
      }

      // Validate stage sequence
      const completedStages = settlement.stages
        .filter((s) => s.completedAt)
        .map((s) => s.stageNumber);

      const validation = this.validator.validateStageCompletion(params.stageNumber, completedStages);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Mark stage as completed
      stage.completedAt = Date.now();
      stage.completedBy = params.completedBy;

      // Update current stage (highest completed stage number)
      settlement.currentStage = params.stageNumber;
      settlement.settlementHash = this.calculateSettlementHash(settlement);

      this.saveSettlement(settlement);

      logger.info('Settlement stage completed', {
        settlementId: params.settlementId,
        stageNumber: params.stageNumber,
        completedBy: params.completedBy,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error completing settlement stage', { error });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Contest a settlement (link to MP-03 dispute)
   */
  public contestSettlement(settlementId: string, disputeId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const settlement = this.settlements.get(settlementId);

      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      if (settlement.immutable) {
        return { success: false, error: 'Cannot contest finalized settlement' };
      }

      settlement.status = 'contested';
      settlement.contestedAt = Date.now();
      settlement.disputeId = disputeId;

      this.saveSettlement(settlement);

      logger.warn('Settlement contested', {
        settlementId,
        disputeId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error contesting settlement', { error });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Reverse a settlement (create reversal record)
   */
  public reverseSettlement(settlementId: string, reversalSettlementId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const settlement = this.settlements.get(settlementId);

      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      settlement.status = 'reversed';
      settlement.reversedAt = Date.now();
      settlement.reversalSettlementId = reversalSettlementId;

      this.saveSettlement(settlement);

      logger.info('Settlement reversed', {
        settlementId,
        reversalSettlementId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error reversing settlement', { error });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Record a settlement risk
   */
  private recordRisk(params: Omit<SettlementRisk, 'riskId' | 'detectedAt' | 'resolved'>): void {
    const riskId = nanoid();
    const risk: SettlementRisk = {
      riskId,
      ...params,
      detectedAt: Date.now(),
      resolved: false,
    };

    this.risks.set(riskId, risk);
    this.saveRisk(risk);

    logger.warn('Settlement risk recorded', {
      riskId,
      settlementId: params.settlementId,
      riskType: params.riskType,
      severity: params.severity,
    });
  }

  /**
   * Get settlement by ID
   */
  public getSettlement(settlementId: string): Settlement | undefined {
    return this.settlements.get(settlementId);
  }

  /**
   * Get settlements by party
   */
  public getSettlementsByParty(partyId: string): Settlement[] {
    return Array.from(this.settlements.values()).filter((settlement) =>
      settlement.requiredParties.includes(partyId)
    );
  }

  /**
   * Get settlements by status
   */
  public getSettlementsByStatus(status: MP05SettlementStatus): Settlement[] {
    return Array.from(this.settlements.values()).filter((s) => s.status === status);
  }

  /**
   * Get risks for a settlement
   */
  public getRisksForSettlement(settlementId: string): SettlementRisk[] {
    return Array.from(this.risks.values()).filter((r) => r.settlementId === settlementId);
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalSettlements: number;
    settlementsByStatus: Record<MP05SettlementStatus, number>;
    stagedSettlements: number;
    finalizedSettlements: number;
    contestedSettlements: number;
    totalRisks: number;
    risksBySeverity: Record<string, number>;
  } {
    const settlementsByStatus: Record<MP05SettlementStatus, number> = {
      declared: 0,
      ratified: 0,
      finalized: 0,
      contested: 0,
      reversed: 0,
    };

    let stagedCount = 0;
    let finalizedCount = 0;
    let contestedCount = 0;

    for (const settlement of this.settlements.values()) {
      settlementsByStatus[settlement.status]++;

      if (settlement.isStaged) stagedCount++;
      if (settlement.immutable) finalizedCount++;
      if (settlement.status === 'contested') contestedCount++;
    }

    const risksBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    for (const risk of this.risks.values()) {
      risksBySeverity[risk.severity]++;
    }

    return {
      totalSettlements: this.settlements.size,
      settlementsByStatus,
      stagedSettlements: stagedCount,
      finalizedSettlements: finalizedCount,
      contestedSettlements: contestedCount,
      totalRisks: this.risks.size,
      risksBySeverity,
    };
  }

  /**
   * Calculate SHA-256 hash of settlement
   */
  private calculateSettlementHash(settlement: Settlement): string {
    const hashContent = {
      settlementId: settlement.settlementId,
      referencedAgreements: settlement.referencedAgreements,
      referencedReceipts: settlement.referencedReceipts,
      referencedLicenses: settlement.referencedLicenses,
      requiredParties: settlement.requiredParties,
      declarations: settlement.declarations,
      settlementStatement: settlement.settlementStatement,
      ratifiedAt: settlement.ratifiedAt,
      finalizedAt: settlement.finalizedAt,
    };

    return crypto.createHash('sha256').update(JSON.stringify(hashContent)).digest('hex');
  }

  /**
   * Calculate SHA-256 hash of declaration
   */
  private calculateDeclarationHash(declaration: Omit<SettlementDeclaration, 'declarationHash'>): string {
    return crypto.createHash('sha256').update(JSON.stringify(declaration)).digest('hex');
  }

  /**
   * Save settlement to disk
   */
  private saveSettlement(settlement: Settlement): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    const filePath = path.join(this.dataPath, `${settlement.settlementId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(settlement, null, 2));
    } catch (error) {
      logger.error('Error saving settlement', {
        settlementId: settlement.settlementId,
        error,
      });
    }
  }

  /**
   * Save risk to disk
   */
  private saveRisk(risk: SettlementRisk): void {
    if (!fs.existsSync(this.risksPath)) {
      fs.mkdirSync(this.risksPath, { recursive: true });
    }
    const filePath = path.join(this.risksPath, `${risk.riskId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(risk, null, 2));
    } catch (error) {
      logger.error('Error saving risk', { riskId: risk.riskId, error });
    }
  }

  /**
   * Load settlements from disk
   */
  private loadSettlements(): void {
    if (!fs.existsSync(this.dataPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.dataPath, file);
        if (fs.statSync(filePath).isDirectory()) {
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const settlement: Settlement = JSON.parse(content);

        this.settlements.set(settlement.settlementId, settlement);
      }

      logger.info('Settlements loaded from disk', {
        count: this.settlements.size,
      });
    } catch (error) {
      logger.error('Error loading settlements', { error });
    }
  }

  /**
   * Load risks from disk
   */
  private loadRisks(): void {
    if (!fs.existsSync(this.risksPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.risksPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.risksPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const risk: SettlementRisk = JSON.parse(content);

        this.risks.set(risk.riskId, risk);
      }

      logger.info('Settlement risks loaded from disk', {
        count: this.risks.size,
      });
    } catch (error) {
      logger.error('Error loading risks', { error });
    }
  }
}
