import axios from 'axios';
import { randomBytes } from 'crypto';
import { MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';

/**
 * Validator information for rotation purposes
 */
export interface ValidatorInfo {
  mediatorId: string;
  effectiveStake: number;
  isActive: boolean;
  slotIndex: number; // -1 if not in active set
  lastActiveAt: number;
  joinedAt: number;
  missedSlots: number; // Count of missed slots for jailing
}

/**
 * Epoch represents a rotation period
 */
export interface Epoch {
  epochNumber: number;
  startTime: number;
  endTime: number;
  activeValidators: string[]; // Ordered list of mediator IDs
  slotDurationMs: number;
  totalSlots: number;
}

/**
 * Slot assignment for a specific time
 */
export interface SlotAssignment {
  epochNumber: number;
  slotIndex: number;
  validatorId: string;
  startTime: number;
  endTime: number;
  isCurrentSlot: boolean;
}

/**
 * Rotation event for tracking changes
 */
export interface RotationEvent {
  eventId: string;
  eventType: 'epoch_start' | 'validator_joined' | 'validator_left' | 'validator_jailed' | 'stake_changed';
  timestamp: number;
  epochNumber: number;
  affectedValidators: string[];
  details: Record<string, any>;
}

/**
 * Configuration for validator rotation
 */
export interface RotationConfig {
  activeSlots: number; // Number of active validator slots (default: 21)
  rotationPeriodHours: number; // Epoch duration in hours (default: 24)
  slotDurationMinutes: number; // How long each validator's slot lasts (default: 10)
  minStakeForRotation: number; // Minimum stake to be considered (default: 1000)
  jailThreshold: number; // Missed slots before jailing (default: 3)
  unjailCooldownHours: number; // Hours before unjailing allowed (default: 24)
}

/**
 * ValidatorRotationManager implements DPoS validator rotation with slot-based scheduling.
 *
 * Key features:
 * - Epoch-based rotation periods
 * - Stake-weighted validator selection
 * - Round-robin slot assignment within epochs
 * - Missed slot tracking and jailing
 * - Dynamic validator set updates
 */
export class ValidatorRotationManager {
  private config: MediatorConfig;
  private rotationConfig: RotationConfig;

  // Validator state
  private validators: Map<string, ValidatorInfo> = new Map();
  private currentEpoch: Epoch | null = null;
  private epochHistory: Epoch[] = [];
  private rotationEvents: RotationEvent[] = [];

  // Jailed validators
  private jailedValidators: Map<string, { jailedAt: number; reason: string }> = new Map();

  // Rotation timer
  private epochTimer: NodeJS.Timeout | null = null;
  private slotTimer: NodeJS.Timeout | null = null;

  constructor(config: MediatorConfig) {
    this.config = config;

    // Initialize rotation config from governance parameters or defaults
    this.rotationConfig = {
      activeSlots: config.bondedStakeAmount ? 21 : 21, // Default to 21 validators
      rotationPeriodHours: 24,
      slotDurationMinutes: 10,
      minStakeForRotation: config.minEffectiveStake || 1000,
      jailThreshold: 3,
      unjailCooldownHours: 24,
    };

    logger.info('ValidatorRotationManager initialized', {
      activeSlots: this.rotationConfig.activeSlots,
      rotationPeriodHours: this.rotationConfig.rotationPeriodHours,
      slotDurationMinutes: this.rotationConfig.slotDurationMinutes,
    });
  }

  /**
   * Start the rotation manager
   */
  public async start(): Promise<void> {
    logger.info('Starting ValidatorRotationManager');

    // Load validators from chain
    await this.loadValidatorsFromChain();

    // Initialize or restore current epoch
    await this.initializeEpoch();

    // Start epoch monitoring
    this.startEpochMonitoring();

    logger.info('ValidatorRotationManager started', {
      validatorCount: this.validators.size,
      currentEpoch: this.currentEpoch?.epochNumber,
      activeValidators: this.currentEpoch?.activeValidators.length,
    });
  }

  /**
   * Stop the rotation manager
   */
  public stop(): void {
    if (this.epochTimer) {
      clearTimeout(this.epochTimer);
      this.epochTimer = null;
    }
    if (this.slotTimer) {
      clearTimeout(this.slotTimer);
      this.slotTimer = null;
    }
    logger.info('ValidatorRotationManager stopped');
  }

  /**
   * Load validators and their stakes from the chain
   */
  private async loadValidatorsFromChain(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/validators`
      );

      if (response.data && response.data.validators) {
        for (const v of response.data.validators) {
          this.validators.set(v.mediatorId, {
            mediatorId: v.mediatorId,
            effectiveStake: v.effectiveStake || 0,
            isActive: false,
            slotIndex: -1,
            lastActiveAt: v.lastActiveAt || 0,
            joinedAt: v.joinedAt || Date.now(),
            missedSlots: v.missedSlots || 0,
          });
        }

        logger.info('Loaded validators from chain', {
          count: this.validators.size,
        });
      }
    } catch (error) {
      logger.warn('Could not load validators from chain, starting with empty set', { error });
    }
  }

  /**
   * Initialize or restore the current epoch
   */
  private async initializeEpoch(): Promise<void> {
    const now = Date.now();
    const epochDurationMs = this.rotationConfig.rotationPeriodHours * 60 * 60 * 1000;

    // Calculate epoch number based on time
    const epochNumber = Math.floor(now / epochDurationMs);
    const epochStartTime = epochNumber * epochDurationMs;
    const epochEndTime = epochStartTime + epochDurationMs;

    // Select active validators for this epoch
    const activeValidators = this.selectActiveValidators();

    // Calculate slots per epoch
    const slotDurationMs = this.rotationConfig.slotDurationMinutes * 60 * 1000;
    const totalSlots = Math.floor(epochDurationMs / slotDurationMs);

    this.currentEpoch = {
      epochNumber,
      startTime: epochStartTime,
      endTime: epochEndTime,
      activeValidators,
      slotDurationMs,
      totalSlots,
    };

    // Update validator active status
    this.updateValidatorActiveStatus(activeValidators);

    // Record epoch start event
    this.recordRotationEvent({
      eventType: 'epoch_start',
      epochNumber,
      affectedValidators: activeValidators,
      details: {
        startTime: epochStartTime,
        endTime: epochEndTime,
        totalSlots,
      },
    });

    logger.info('Epoch initialized', {
      epochNumber,
      activeValidators: activeValidators.length,
      totalSlots,
      startTime: new Date(epochStartTime).toISOString(),
      endTime: new Date(epochEndTime).toISOString(),
    });
  }

  /**
   * Select top validators by effective stake
   */
  private selectActiveValidators(): string[] {
    // Filter eligible validators (not jailed, meets minimum stake)
    const eligible = Array.from(this.validators.values())
      .filter(v =>
        v.effectiveStake >= this.rotationConfig.minStakeForRotation &&
        !this.jailedValidators.has(v.mediatorId)
      );

    // Sort by effective stake (descending)
    eligible.sort((a, b) => b.effectiveStake - a.effectiveStake);

    // Take top N validators
    const selected = eligible
      .slice(0, this.rotationConfig.activeSlots)
      .map(v => v.mediatorId);

    logger.debug('Selected active validators', {
      eligible: eligible.length,
      selected: selected.length,
      topStake: eligible[0]?.effectiveStake,
    });

    return selected;
  }

  /**
   * Update validator active status based on selection
   */
  private updateValidatorActiveStatus(activeValidators: string[]): void {
    // Reset all validators
    for (const validator of this.validators.values()) {
      validator.isActive = false;
      validator.slotIndex = -1;
    }

    // Set active validators
    activeValidators.forEach((mediatorId, index) => {
      const validator = this.validators.get(mediatorId);
      if (validator) {
        validator.isActive = true;
        validator.slotIndex = index;
      }
    });
  }

  /**
   * Start epoch monitoring timers
   */
  private startEpochMonitoring(): void {
    if (!this.currentEpoch) return;

    const now = Date.now();
    const timeUntilNextEpoch = this.currentEpoch.endTime - now;

    // Schedule next epoch transition
    this.epochTimer = setTimeout(() => {
      this.transitionToNextEpoch();
    }, Math.max(timeUntilNextEpoch, 1000));

    logger.debug('Epoch monitoring started', {
      timeUntilNextEpoch: Math.round(timeUntilNextEpoch / 1000 / 60) + ' minutes',
    });
  }

  /**
   * Transition to the next epoch
   */
  private async transitionToNextEpoch(): Promise<void> {
    if (this.currentEpoch) {
      this.epochHistory.push(this.currentEpoch);

      // Keep only last 100 epochs in history
      if (this.epochHistory.length > 100) {
        this.epochHistory.shift();
      }
    }

    await this.initializeEpoch();
    this.startEpochMonitoring();
  }

  /**
   * Get current slot assignment
   */
  public getCurrentSlot(): SlotAssignment | null {
    if (!this.currentEpoch || this.currentEpoch.activeValidators.length === 0) {
      return null;
    }

    const now = Date.now();
    const epochElapsed = now - this.currentEpoch.startTime;
    const slotIndex = Math.floor(epochElapsed / this.currentEpoch.slotDurationMs);

    // Round-robin through active validators
    const validatorIndex = slotIndex % this.currentEpoch.activeValidators.length;
    const validatorId = this.currentEpoch.activeValidators[validatorIndex];

    const slotStartTime = this.currentEpoch.startTime + (slotIndex * this.currentEpoch.slotDurationMs);
    const slotEndTime = slotStartTime + this.currentEpoch.slotDurationMs;

    return {
      epochNumber: this.currentEpoch.epochNumber,
      slotIndex,
      validatorId,
      startTime: slotStartTime,
      endTime: slotEndTime,
      isCurrentSlot: now >= slotStartTime && now < slotEndTime,
    };
  }

  /**
   * Check if this mediator is the current active validator
   */
  public isCurrentValidator(): boolean {
    const slot = this.getCurrentSlot();
    return slot?.validatorId === this.config.mediatorPublicKey;
  }

  /**
   * Get the next slot assignment for this mediator
   */
  public getNextSlotForMediator(): SlotAssignment | null {
    if (!this.currentEpoch) return null;

    const myIndex = this.currentEpoch.activeValidators.indexOf(this.config.mediatorPublicKey);
    if (myIndex === -1) return null;

    const currentSlot = this.getCurrentSlot();
    if (!currentSlot) return null;

    // Find next occurrence of our slot
    let nextSlotIndex = currentSlot.slotIndex;
    const validatorCount = this.currentEpoch.activeValidators.length;

    // Calculate how many slots until our next turn
    const currentValidatorIndex = currentSlot.slotIndex % validatorCount;
    let slotsUntilNext = (myIndex - currentValidatorIndex + validatorCount) % validatorCount;

    // If it's currently our slot, get the next one
    if (slotsUntilNext === 0 && currentSlot.isCurrentSlot) {
      slotsUntilNext = validatorCount;
    }

    nextSlotIndex = currentSlot.slotIndex + slotsUntilNext;

    const slotStartTime = this.currentEpoch.startTime + (nextSlotIndex * this.currentEpoch.slotDurationMs);
    const slotEndTime = slotStartTime + this.currentEpoch.slotDurationMs;

    return {
      epochNumber: this.currentEpoch.epochNumber,
      slotIndex: nextSlotIndex,
      validatorId: this.config.mediatorPublicKey,
      startTime: slotStartTime,
      endTime: slotEndTime,
      isCurrentSlot: false,
    };
  }

  /**
   * Register a new validator
   */
  public async registerValidator(mediatorId: string, effectiveStake: number): Promise<boolean> {
    if (effectiveStake < this.rotationConfig.minStakeForRotation) {
      logger.warn('Validator does not meet minimum stake', {
        mediatorId,
        effectiveStake,
        required: this.rotationConfig.minStakeForRotation,
      });
      return false;
    }

    const now = Date.now();

    this.validators.set(mediatorId, {
      mediatorId,
      effectiveStake,
      isActive: false,
      slotIndex: -1,
      lastActiveAt: 0,
      joinedAt: now,
      missedSlots: 0,
    });

    this.recordRotationEvent({
      eventType: 'validator_joined',
      epochNumber: this.currentEpoch?.epochNumber || 0,
      affectedValidators: [mediatorId],
      details: { effectiveStake },
    });

    logger.info('Validator registered', { mediatorId, effectiveStake });

    // Submit to chain
    try {
      await axios.post(`${this.config.chainEndpoint}/api/v1/validators/register`, {
        mediatorId,
        effectiveStake,
        timestamp: now,
        signature: generateSignature(
          `${mediatorId}:${effectiveStake}:${now}`,
          this.config.mediatorPrivateKey
        ),
      });
    } catch (error) {
      logger.error('Failed to register validator on chain', { error });
    }

    return true;
  }

  /**
   * Update validator stake
   */
  public async updateValidatorStake(mediatorId: string, newStake: number): Promise<void> {
    const validator = this.validators.get(mediatorId);
    if (!validator) {
      logger.warn('Validator not found for stake update', { mediatorId });
      return;
    }

    const oldStake = validator.effectiveStake;
    validator.effectiveStake = newStake;

    this.recordRotationEvent({
      eventType: 'stake_changed',
      epochNumber: this.currentEpoch?.epochNumber || 0,
      affectedValidators: [mediatorId],
      details: { oldStake, newStake },
    });

    logger.info('Validator stake updated', { mediatorId, oldStake, newStake });

    // Check if this affects active set (will take effect next epoch)
    const newActive = this.selectActiveValidators();
    if (validator.isActive && !newActive.includes(mediatorId)) {
      logger.info('Validator will be removed from active set next epoch', { mediatorId });
    } else if (!validator.isActive && newActive.includes(mediatorId)) {
      logger.info('Validator will be added to active set next epoch', { mediatorId });
    }
  }

  /**
   * Remove a validator
   */
  public async removeValidator(mediatorId: string): Promise<void> {
    const validator = this.validators.get(mediatorId);
    if (!validator) return;

    this.validators.delete(mediatorId);

    this.recordRotationEvent({
      eventType: 'validator_left',
      epochNumber: this.currentEpoch?.epochNumber || 0,
      affectedValidators: [mediatorId],
      details: { effectiveStake: validator.effectiveStake },
    });

    logger.info('Validator removed', { mediatorId });
  }

  /**
   * Jail a validator for missing slots
   */
  public async jailValidator(mediatorId: string, reason: string): Promise<void> {
    const validator = this.validators.get(mediatorId);
    if (!validator) return;

    this.jailedValidators.set(mediatorId, {
      jailedAt: Date.now(),
      reason,
    });

    validator.isActive = false;
    validator.slotIndex = -1;

    this.recordRotationEvent({
      eventType: 'validator_jailed',
      epochNumber: this.currentEpoch?.epochNumber || 0,
      affectedValidators: [mediatorId],
      details: { reason, missedSlots: validator.missedSlots },
    });

    logger.warn('Validator jailed', { mediatorId, reason });

    // Submit to chain
    try {
      await axios.post(`${this.config.chainEndpoint}/api/v1/validators/jail`, {
        mediatorId,
        reason,
        timestamp: Date.now(),
        signature: generateSignature(
          `jail:${mediatorId}:${reason}:${Date.now()}`,
          this.config.mediatorPrivateKey
        ),
      });
    } catch (error) {
      logger.error('Failed to jail validator on chain', { error });
    }
  }

  /**
   * Unjail a validator after cooldown
   */
  public async unjailValidator(mediatorId: string): Promise<boolean> {
    const jailInfo = this.jailedValidators.get(mediatorId);
    if (!jailInfo) {
      logger.warn('Validator not jailed', { mediatorId });
      return false;
    }

    const cooldownMs = this.rotationConfig.unjailCooldownHours * 60 * 60 * 1000;
    const now = Date.now();

    if (now - jailInfo.jailedAt < cooldownMs) {
      const remainingHours = Math.ceil((cooldownMs - (now - jailInfo.jailedAt)) / (60 * 60 * 1000));
      logger.warn('Unjail cooldown not complete', { mediatorId, remainingHours });
      return false;
    }

    this.jailedValidators.delete(mediatorId);

    const validator = this.validators.get(mediatorId);
    if (validator) {
      validator.missedSlots = 0;
    }

    logger.info('Validator unjailed', { mediatorId });
    return true;
  }

  /**
   * Record a missed slot for a validator
   */
  public recordMissedSlot(mediatorId: string): void {
    const validator = this.validators.get(mediatorId);
    if (!validator) return;

    validator.missedSlots++;

    logger.warn('Validator missed slot', {
      mediatorId,
      missedSlots: validator.missedSlots,
      threshold: this.rotationConfig.jailThreshold,
    });

    // Check if should be jailed
    if (validator.missedSlots >= this.rotationConfig.jailThreshold) {
      this.jailValidator(mediatorId, `Missed ${validator.missedSlots} consecutive slots`);
    }
  }

  /**
   * Record successful slot activity
   */
  public recordSlotActivity(mediatorId: string): void {
    const validator = this.validators.get(mediatorId);
    if (validator) {
      validator.lastActiveAt = Date.now();
      validator.missedSlots = 0; // Reset missed slots on activity
    }
  }

  /**
   * Record a rotation event
   */
  private recordRotationEvent(event: Omit<RotationEvent, 'eventId' | 'timestamp'>): void {
    const rotationEvent: RotationEvent = {
      ...event,
      eventId: `rotation-${Date.now()}-${randomBytes(6).toString('hex')}`,
      timestamp: Date.now(),
    };

    this.rotationEvents.push(rotationEvent);

    // Keep only last 1000 events
    if (this.rotationEvents.length > 1000) {
      this.rotationEvents.shift();
    }
  }

  /**
   * Update rotation configuration (via governance)
   */
  public updateRotationConfig(updates: Partial<RotationConfig>): void {
    this.rotationConfig = {
      ...this.rotationConfig,
      ...updates,
    };

    logger.info('Rotation configuration updated', updates);
  }

  /**
   * Get current epoch info
   */
  public getCurrentEpoch(): Epoch | null {
    return this.currentEpoch;
  }

  /**
   * Get all validators
   */
  public getAllValidators(): ValidatorInfo[] {
    return Array.from(this.validators.values());
  }

  /**
   * Get active validators
   */
  public getActiveValidators(): ValidatorInfo[] {
    return Array.from(this.validators.values()).filter(v => v.isActive);
  }

  /**
   * Get jailed validators
   */
  public getJailedValidators(): Map<string, { jailedAt: number; reason: string }> {
    return new Map(this.jailedValidators);
  }

  /**
   * Get rotation events
   */
  public getRotationEvents(limit: number = 100): RotationEvent[] {
    return this.rotationEvents.slice(-limit);
  }

  /**
   * Get rotation status summary
   */
  public getStatus(): {
    currentEpoch: Epoch | null;
    currentSlot: SlotAssignment | null;
    isCurrentValidator: boolean;
    nextSlot: SlotAssignment | null;
    validatorCount: number;
    activeValidatorCount: number;
    jailedCount: number;
    config: RotationConfig;
  } {
    return {
      currentEpoch: this.currentEpoch,
      currentSlot: this.getCurrentSlot(),
      isCurrentValidator: this.isCurrentValidator(),
      nextSlot: this.getNextSlotForMediator(),
      validatorCount: this.validators.size,
      activeValidatorCount: this.currentEpoch?.activeValidators.length || 0,
      jailedCount: this.jailedValidators.size,
      config: this.rotationConfig,
    };
  }

  /**
   * Check if mediator should be active (for mediation gating)
   */
  public shouldMediate(): boolean {
    // In DPoS mode, only mediate if it's our slot
    if (this.config.consensusMode === 'dpos') {
      return this.isCurrentValidator();
    }

    // In hybrid mode, check if we're in the active set at all
    if (this.config.consensusMode === 'hybrid') {
      const validator = this.validators.get(this.config.mediatorPublicKey);
      return validator?.isActive || false;
    }

    // In other modes, always allow
    return true;
  }

  /**
   * Get time until next slot for this mediator
   */
  public getTimeUntilNextSlot(): number {
    const nextSlot = this.getNextSlotForMediator();
    if (!nextSlot) return -1;

    return Math.max(0, nextSlot.startTime - Date.now());
  }
}
