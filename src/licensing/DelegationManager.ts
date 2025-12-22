import {
  MediatorConfig,
  Delegation,
  DelegationScope,
  DelegationStatus,
  DelegatedAction,
} from '../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Delegation proposal parameters
 */
export interface DelegationProposalParams {
  delegatorId: string;
  delegateId: string;
  proposedBy: string;
  delegatedPowers: string[];
  constraints?: string[];
  revocationConditions?: string[];
  duration: {
    type: 'perpetual' | 'time_bounded';
    expiresAt?: number;
  };
  transferability?: {
    redelegationAllowed?: boolean;
    maxRedelegationDepth?: number;
  };
  parentDelegationId?: string; // For redelegations
}

/**
 * Delegation ratification parameters
 */
export interface DelegationRatificationParams {
  delegationId: string;
  ratifiedBy: string; // Must be the delegator
  ratificationStatement: string;
  signature?: string;
  humanAuthorship: boolean;
}

/**
 * Delegated action parameters
 */
export interface DelegatedActionParams {
  delegationId: string;
  delegateId: string;
  actionType: string;
  actionDescription: string;
  referencedGrant: string; // Must reference the delegation
}

/**
 * Delegation revocation parameters
 */
export interface DelegationRevocationParams {
  delegationId: string;
  revokedBy: string; // Must be the delegator
  revocationStatement: string;
  signature?: string;
}

/**
 * Manages delegation lifecycle and validation
 * Implements MP-04 Delegation Protocol
 */
export class DelegationManager {
  private config: MediatorConfig;
  private delegations: Map<string, Delegation> = new Map();
  private actions: Map<string, DelegatedAction> = new Map();
  private dataPath: string;
  private actionsPath: string;

  constructor(config: MediatorConfig, dataPath: string = './data/delegations') {
    this.config = config;
    this.dataPath = dataPath;
    this.actionsPath = path.join(dataPath, 'actions');

    // Ensure data directories exist
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.actionsPath)) {
      fs.mkdirSync(this.actionsPath, { recursive: true });
    }

    // Load existing delegations and actions
    this.loadDelegations();
    this.loadActions();

    logger.info('DelegationManager initialized', {
      dataPath,
      delegationsLoaded: this.delegations.size,
      actionsLoaded: this.actions.size,
    });
  }

  /**
   * Propose a new delegation
   * Phase 1 of delegation lifecycle
   */
  public proposeDelegation(params: DelegationProposalParams): {
    success: boolean;
    delegationId?: string;
    error?: string;
  } {
    try {
      // Validate required fields
      if (!params.delegatorId || !params.delegateId) {
        return {
          success: false,
          error: 'Delegator and delegate are required',
        };
      }

      if (!params.delegatedPowers || params.delegatedPowers.length === 0) {
        return {
          success: false,
          error: 'At least one delegated power is required',
        };
      }

      // Validate powers are not empty
      if (params.delegatedPowers.some((p) => !p || p.trim().length === 0)) {
        return {
          success: false,
          error: 'Delegated powers cannot be empty',
        };
      }

      // Validate duration
      if (params.duration.type === 'time_bounded' && !params.duration.expiresAt) {
        return {
          success: false,
          error: 'Expiration time required for time-bounded delegations',
        };
      }

      if (params.duration.type === 'time_bounded' && params.duration.expiresAt! <= Date.now()) {
        return {
          success: false,
          error: 'Expiration time must be in the future',
        };
      }

      // Validate redelegation if applicable
      let redelegationDepth = 0;
      if (params.parentDelegationId) {
        const parent = this.delegations.get(params.parentDelegationId);
        if (!parent) {
          return {
            success: false,
            error: 'Parent delegation not found',
          };
        }

        if (parent.status !== 'active') {
          return {
            success: false,
            error: `Parent delegation is not active (status: ${parent.status})`,
          };
        }

        if (!parent.scope.transferability.redelegationAllowed) {
          return {
            success: false,
            error: 'Parent delegation does not allow redelegation',
          };
        }

        redelegationDepth = parent.redelegationDepth + 1;

        const maxDepth =
          params.transferability?.maxRedelegationDepth ??
          parent.scope.transferability.maxRedelegationDepth ??
          this.config.maxDelegationDepth ??
          3;

        if (redelegationDepth > maxDepth) {
          return {
            success: false,
            error: `Redelegation depth ${redelegationDepth} exceeds maximum ${maxDepth}`,
          };
        }

        // Validate delegate is the parent delegator or parent delegate
        if (params.delegatorId !== parent.delegateId) {
          return {
            success: false,
            error: 'Only the delegate of parent delegation can redelegate',
          };
        }
      }

      const delegationId = nanoid();
      const now = Date.now();

      const scope: DelegationScope = {
        delegatedPowers: params.delegatedPowers,
        constraints: params.constraints || [],
        revocationConditions: params.revocationConditions || [],
        duration: params.duration,
        transferability: {
          redelegationAllowed: params.transferability?.redelegationAllowed ?? false,
          maxRedelegationDepth: params.transferability?.maxRedelegationDepth,
        },
      };

      const delegation: Delegation = {
        delegationId,
        delegatorId: params.delegatorId,
        delegateId: params.delegateId,
        scope,
        status: 'proposed',
        proposedAt: now,
        proposedBy: params.proposedBy,
        parentDelegationId: params.parentDelegationId,
        redelegationDepth,
        humanAuthorship: false,
        delegationHash: '',
      };

      // Store delegation
      this.delegations.set(delegationId, delegation);
      this.saveDelegation(delegation);

      logger.info('Delegation proposed', {
        delegationId,
        delegatorId: params.delegatorId,
        delegateId: params.delegateId,
        proposedBy: params.proposedBy,
        redelegationDepth,
        powersCount: params.delegatedPowers.length,
      });

      return {
        success: true,
        delegationId,
      };
    } catch (error) {
      logger.error('Error proposing delegation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Ratify a proposed delegation
   * Phase 2 of delegation lifecycle - requires human authorship
   */
  public ratifyDelegation(params: DelegationRatificationParams): {
    success: boolean;
    error?: string;
  } {
    try {
      const delegation = this.delegations.get(params.delegationId);

      if (!delegation) {
        return {
          success: false,
          error: 'Delegation not found',
        };
      }

      // Validate status
      if (delegation.status !== 'proposed') {
        return {
          success: false,
          error: `Delegation cannot be ratified from ${delegation.status} status`,
        };
      }

      // Validate ratifier is the delegator
      if (params.ratifiedBy !== delegation.delegatorId) {
        return {
          success: false,
          error: 'Only the delegator can ratify a delegation',
        };
      }

      // Validate human authorship requirement
      const requireHuman = this.config.requireHumanRatification ?? true;
      if (requireHuman && !params.humanAuthorship) {
        return {
          success: false,
          error: 'Human authorship required for ratification',
        };
      }

      // Validate ratification statement
      if (!params.ratificationStatement || params.ratificationStatement.trim().length === 0) {
        return {
          success: false,
          error: 'Ratification statement is required',
        };
      }

      const now = Date.now();

      // Update delegation
      delegation.status = 'ratified';
      delegation.ratifiedAt = now;
      delegation.ratificationStatement = params.ratificationStatement;
      delegation.signature = params.signature;
      delegation.humanAuthorship = params.humanAuthorship;

      // Calculate delegation hash
      delegation.delegationHash = this.calculateDelegationHash(delegation);

      this.saveDelegation(delegation);

      logger.info('Delegation ratified', {
        delegationId: params.delegationId,
        delegatorId: delegation.delegatorId,
        humanAuthorship: params.humanAuthorship,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error ratifying delegation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Activate a ratified delegation
   * Phase 3 of delegation lifecycle
   */
  public activateDelegation(delegationId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const delegation = this.delegations.get(delegationId);

      if (!delegation) {
        return {
          success: false,
          error: 'Delegation not found',
        };
      }

      // Validate status
      if (delegation.status !== 'ratified') {
        return {
          success: false,
          error: `Delegation cannot be activated from ${delegation.status} status`,
        };
      }

      // Check if already expired
      if (
        delegation.scope.duration.type === 'time_bounded' &&
        delegation.scope.duration.expiresAt! <= Date.now()
      ) {
        delegation.status = 'expired';
        this.saveDelegation(delegation);

        return {
          success: false,
          error: 'Delegation has already expired',
        };
      }

      const now = Date.now();

      // Update delegation
      delegation.status = 'active';
      delegation.activatedAt = now;

      this.saveDelegation(delegation);

      logger.info('Delegation activated', {
        delegationId,
        delegatorId: delegation.delegatorId,
        delegateId: delegation.delegateId,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error activating delegation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Record a delegated action
   * Actions must reference the delegation and stay within scope
   */
  public recordDelegatedAction(params: DelegatedActionParams): {
    success: boolean;
    actionId?: string;
    withinScope?: boolean;
    error?: string;
  } {
    try {
      const delegation = this.delegations.get(params.delegationId);

      if (!delegation) {
        return {
          success: false,
          error: 'Delegation not found',
        };
      }

      // Validate delegation is active
      if (delegation.status !== 'active') {
        return {
          success: false,
          error: `Delegation is not active (status: ${delegation.status})`,
        };
      }

      // Validate delegate
      if (params.delegateId !== delegation.delegateId) {
        return {
          success: false,
          error: 'Action performer does not match delegation delegate',
        };
      }

      // Validate referenced grant
      if (params.referencedGrant !== params.delegationId) {
        return {
          success: false,
          error: 'Action must reference the delegation grant',
        };
      }

      const actionId = nanoid();
      const now = Date.now();

      // Check scope compliance (simple keyword matching)
      const withinScope = this.checkActionScope(delegation, params);

      const actionHash = this.calculateActionHash({
        actionId,
        delegationId: params.delegationId,
        delegateId: params.delegateId,
        actionType: params.actionType,
        actionDescription: params.actionDescription,
        performedAt: now,
      });

      const action: DelegatedAction = {
        actionId,
        delegationId: params.delegationId,
        delegateId: params.delegateId,
        actionType: params.actionType,
        actionDescription: params.actionDescription,
        performedAt: now,
        withinScope,
        referencedGrant: params.referencedGrant,
        actionHash,
      };

      // Store action
      this.actions.set(actionId, action);
      this.saveAction(action);

      logger.info('Delegated action recorded', {
        actionId,
        delegationId: params.delegationId,
        actionType: params.actionType,
        withinScope,
      });

      return {
        success: true,
        actionId,
        withinScope,
      };
    } catch (error) {
      logger.error('Error recording delegated action', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Revoke an active delegation
   * Requires human authorship and natural language statement
   */
  public revokeDelegation(params: DelegationRevocationParams): {
    success: boolean;
    error?: string;
  } {
    try {
      const delegation = this.delegations.get(params.delegationId);

      if (!delegation) {
        return {
          success: false,
          error: 'Delegation not found',
        };
      }

      // Validate status
      if (delegation.status === 'revoked') {
        return {
          success: false,
          error: 'Delegation is already revoked',
        };
      }

      if (delegation.status === 'expired') {
        return {
          success: false,
          error: 'Cannot revoke an expired delegation',
        };
      }

      // Validate revoker is the delegator
      if (params.revokedBy !== delegation.delegatorId) {
        return {
          success: false,
          error: 'Only the delegator can revoke a delegation',
        };
      }

      // Validate revocation statement
      if (!params.revocationStatement || params.revocationStatement.trim().length === 0) {
        return {
          success: false,
          error: 'Revocation statement is required',
        };
      }

      const now = Date.now();

      // Update delegation
      delegation.status = 'revoked';
      delegation.revokedAt = now;
      delegation.revocationStatement = params.revocationStatement;
      delegation.revocationSignature = params.signature;

      this.saveDelegation(delegation);

      logger.info('Delegation revoked', {
        delegationId: params.delegationId,
        delegatorId: delegation.delegatorId,
        reason: params.revocationStatement,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error revoking delegation', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Check and expire time-bounded delegations
   */
  public checkAndExpireDelegations(): {
    expiredCount: number;
    expiredDelegations: string[];
  } {
    const now = Date.now();
    const expired: string[] = [];

    for (const delegation of this.delegations.values()) {
      if (
        delegation.status === 'active' &&
        delegation.scope.duration.type === 'time_bounded' &&
        delegation.scope.duration.expiresAt! <= now
      ) {
        delegation.status = 'expired';
        this.saveDelegation(delegation);
        expired.push(delegation.delegationId);

        logger.info('Delegation automatically expired', {
          delegationId: delegation.delegationId,
          expiresAt: delegation.scope.duration.expiresAt,
        });
      }
    }

    return {
      expiredCount: expired.length,
      expiredDelegations: expired,
    };
  }

  /**
   * Check if action is within delegation scope
   * Simple keyword matching for demonstration
   */
  private checkActionScope(delegation: Delegation, actionParams: DelegatedActionParams): boolean {
    const actionText = `${actionParams.actionType} ${actionParams.actionDescription}`.toLowerCase();

    // Check if action matches any delegated powers
    const matchesPower = delegation.scope.delegatedPowers.some((power) =>
      actionText.includes(power.toLowerCase())
    );

    if (!matchesPower) {
      return false;
    }

    // Check if action violates any constraints
    const violatesConstraint = delegation.scope.constraints.some((constraint) =>
      actionText.includes(constraint.toLowerCase())
    );

    if (violatesConstraint) {
      return false;
    }

    return true;
  }

  /**
   * Get delegation by ID
   */
  public getDelegation(delegationId: string): Delegation | undefined {
    return this.delegations.get(delegationId);
  }

  /**
   * Get delegations by delegator
   */
  public getDelegationsByDelegator(delegatorId: string): Delegation[] {
    return Array.from(this.delegations.values()).filter(
      (delegation) => delegation.delegatorId === delegatorId
    );
  }

  /**
   * Get delegations by delegate
   */
  public getDelegationsByDelegate(delegateId: string): Delegation[] {
    return Array.from(this.delegations.values()).filter(
      (delegation) => delegation.delegateId === delegateId
    );
  }

  /**
   * Get delegations by status
   */
  public getDelegationsByStatus(status: DelegationStatus): Delegation[] {
    return Array.from(this.delegations.values()).filter(
      (delegation) => delegation.status === status
    );
  }

  /**
   * Get actions for a delegation
   */
  public getActionsForDelegation(delegationId: string): DelegatedAction[] {
    return Array.from(this.actions.values()).filter(
      (action) => action.delegationId === delegationId
    );
  }

  /**
   * Get out-of-scope actions for a delegation
   */
  public getOutOfScopeActions(delegationId: string): DelegatedAction[] {
    return this.getActionsForDelegation(delegationId).filter((action) => !action.withinScope);
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalDelegations: number;
    delegationsByStatus: Record<DelegationStatus, number>;
    activeDelegations: number;
    expiredDelegations: number;
    revokedDelegations: number;
    totalActions: number;
    actionsWithinScope: number;
    actionsOutOfScope: number;
    averageRedelegationDepth: number;
  } {
    const delegationsByStatus: Record<DelegationStatus, number> = {
      proposed: 0,
      ratified: 0,
      active: 0,
      expired: 0,
      revoked: 0,
    };

    let totalDepth = 0;
    let actionsInScope = 0;
    let actionsOutScope = 0;

    for (const delegation of this.delegations.values()) {
      delegationsByStatus[delegation.status]++;
      totalDepth += delegation.redelegationDepth;
    }

    for (const action of this.actions.values()) {
      if (action.withinScope) {
        actionsInScope++;
      } else {
        actionsOutScope++;
      }
    }

    return {
      totalDelegations: this.delegations.size,
      delegationsByStatus,
      activeDelegations: delegationsByStatus.active,
      expiredDelegations: delegationsByStatus.expired,
      revokedDelegations: delegationsByStatus.revoked,
      totalActions: this.actions.size,
      actionsWithinScope: actionsInScope,
      actionsOutOfScope: actionsOutScope,
      averageRedelegationDepth:
        this.delegations.size > 0
          ? Math.round((totalDepth / this.delegations.size) * 10) / 10
          : 0,
    };
  }

  /**
   * Calculate SHA-256 hash of delegation contents
   */
  private calculateDelegationHash(delegation: Delegation): string {
    const hashContent = {
      delegationId: delegation.delegationId,
      delegatorId: delegation.delegatorId,
      delegateId: delegation.delegateId,
      scope: delegation.scope,
      ratifiedAt: delegation.ratifiedAt,
      ratificationStatement: delegation.ratificationStatement,
      parentDelegationId: delegation.parentDelegationId,
    };

    return crypto.createHash('sha256').update(JSON.stringify(hashContent)).digest('hex');
  }

  /**
   * Calculate SHA-256 hash of action contents
   */
  private calculateActionHash(action: Omit<DelegatedAction, 'actionHash' | 'withinScope' | 'violationId'>): string {
    return crypto.createHash('sha256').update(JSON.stringify(action)).digest('hex');
  }

  /**
   * Save delegation to disk
   */
  private saveDelegation(delegation: Delegation): void {
    const filePath = path.join(this.dataPath, `${delegation.delegationId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(delegation, null, 2));
    } catch (error) {
      logger.error('Error saving delegation', {
        delegationId: delegation.delegationId,
        error,
      });
    }
  }

  /**
   * Save action to disk
   */
  private saveAction(action: DelegatedAction): void {
    const filePath = path.join(this.actionsPath, `${action.actionId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(action, null, 2));
    } catch (error) {
      logger.error('Error saving action', {
        actionId: action.actionId,
        error,
      });
    }
  }

  /**
   * Load all delegations from disk
   */
  private loadDelegations(): void {
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
        const delegation: Delegation = JSON.parse(content);

        this.delegations.set(delegation.delegationId, delegation);
      }

      logger.info('Delegations loaded from disk', {
        count: this.delegations.size,
      });
    } catch (error) {
      logger.error('Error loading delegations', { error });
    }
  }

  /**
   * Load all actions from disk
   */
  private loadActions(): void {
    if (!fs.existsSync(this.actionsPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.actionsPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.actionsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const action: DelegatedAction = JSON.parse(content);

        this.actions.set(action.actionId, action);
      }

      logger.info('Delegated actions loaded from disk', {
        count: this.actions.size,
      });
    } catch (error) {
      logger.error('Error loading actions', { error });
    }
  }
}
