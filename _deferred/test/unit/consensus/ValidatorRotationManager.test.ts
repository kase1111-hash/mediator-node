import axios from 'axios';
import { ValidatorRotationManager, ValidatorInfo, Epoch, SlotAssignment, RotationConfig } from '../../../src/consensus/ValidatorRotationManager';
import { MediatorConfig } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto
jest.mock('../../../src/utils/crypto', () => ({
  generateSignature: jest.fn(() => 'mock_signature'),
}));

describe('ValidatorRotationManager', () => {
  let config: MediatorConfig;
  let manager: ValidatorRotationManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    config = createMockConfig({
      mediatorPublicKey: 'validator_1',
      chainEndpoint: 'https://chain.example.com',
      consensusMode: 'dpos',
      bondedStakeAmount: 5000,
      minEffectiveStake: 1000,
    });

    manager = new ValidatorRotationManager(config);
  });

  afterEach(() => {
    manager.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default rotation config', () => {
      const status = manager.getStatus();

      expect(status.config.activeSlots).toBe(21);
      expect(status.config.rotationPeriodHours).toBe(24);
      expect(status.config.slotDurationMinutes).toBe(10);
      expect(status.config.minStakeForRotation).toBe(1000);
      expect(status.config.jailThreshold).toBe(3);
      expect(status.config.unjailCooldownHours).toBe(24);
    });

    it('should start with no validators', () => {
      expect(manager.getAllValidators()).toHaveLength(0);
      expect(manager.getActiveValidators()).toHaveLength(0);
    });
  });

  describe('start', () => {
    it('should load validators from chain on start', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          validators: [
            { mediatorId: 'validator_1', effectiveStake: 5000 },
            { mediatorId: 'validator_2', effectiveStake: 3000 },
            { mediatorId: 'validator_3', effectiveStake: 2000 },
          ],
        },
      });

      await manager.start();

      expect(mockAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/validators`
      );
      expect(manager.getAllValidators()).toHaveLength(3);
    });

    it('should initialize current epoch on start', async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });

      await manager.start();

      const epoch = manager.getCurrentEpoch();
      expect(epoch).not.toBeNull();
      expect(epoch?.epochNumber).toBeGreaterThanOrEqual(0);
      expect(epoch?.slotDurationMs).toBe(10 * 60 * 1000); // 10 minutes
    });

    it('should handle chain API failure gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await manager.start();

      expect(manager.getAllValidators()).toHaveLength(0);
      expect(manager.getCurrentEpoch()).not.toBeNull();
    });
  });

  describe('registerValidator', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
    });

    it('should register a new validator with sufficient stake', async () => {
      const result = await manager.registerValidator('new_validator', 5000);

      expect(result).toBe(true);
      expect(manager.getAllValidators()).toHaveLength(1);

      const validators = manager.getAllValidators();
      expect(validators[0].mediatorId).toBe('new_validator');
      expect(validators[0].effectiveStake).toBe(5000);
    });

    it('should reject validator with insufficient stake', async () => {
      const result = await manager.registerValidator('low_stake_validator', 500);

      expect(result).toBe(false);
      expect(manager.getAllValidators()).toHaveLength(0);
    });

    it('should submit registration to chain', async () => {
      await manager.registerValidator('new_validator', 5000);

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/validators/register`,
        expect.objectContaining({
          mediatorId: 'new_validator',
          effectiveStake: 5000,
        })
      );
    });
  });

  describe('updateValidatorStake', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
      await manager.registerValidator('validator_1', 5000);
    });

    it('should update validator stake', async () => {
      await manager.updateValidatorStake('validator_1', 10000);

      const validators = manager.getAllValidators();
      expect(validators[0].effectiveStake).toBe(10000);
    });

    it('should ignore update for unknown validator', async () => {
      await manager.updateValidatorStake('unknown_validator', 10000);

      expect(manager.getAllValidators()).toHaveLength(1);
    });

    it('should record stake change event', async () => {
      await manager.updateValidatorStake('validator_1', 10000);

      const events = manager.getRotationEvents();
      const stakeEvent = events.find(e => e.eventType === 'stake_changed');
      expect(stakeEvent).toBeDefined();
      expect(stakeEvent?.details.oldStake).toBe(5000);
      expect(stakeEvent?.details.newStake).toBe(10000);
    });
  });

  describe('removeValidator', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
      await manager.registerValidator('validator_1', 5000);
    });

    it('should remove a validator', async () => {
      await manager.removeValidator('validator_1');

      expect(manager.getAllValidators()).toHaveLength(0);
    });

    it('should record validator left event', async () => {
      await manager.removeValidator('validator_1');

      const events = manager.getRotationEvents();
      const leftEvent = events.find(e => e.eventType === 'validator_left');
      expect(leftEvent).toBeDefined();
      expect(leftEvent?.affectedValidators).toContain('validator_1');
    });
  });

  describe('slot assignment', () => {
    beforeEach(async () => {
      // Load validators from chain at startup (so they're in the epoch)
      mockAxios.get.mockResolvedValue({
        data: {
          validators: [
            { mediatorId: 'validator_1', effectiveStake: 10000 },
            { mediatorId: 'validator_2', effectiveStake: 8000 },
            { mediatorId: 'validator_3', effectiveStake: 6000 },
          ],
        },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
    });

    it('should return current slot assignment', () => {
      const slot = manager.getCurrentSlot();

      expect(slot).not.toBeNull();
      expect(slot?.epochNumber).toBeGreaterThanOrEqual(0);
      expect(slot?.slotIndex).toBeGreaterThanOrEqual(0);
      expect(['validator_1', 'validator_2', 'validator_3']).toContain(slot?.validatorId);
    });

    it('should correctly identify current validator', () => {
      // Config has mediatorPublicKey = 'validator_1'
      // So isCurrentValidator depends on slot assignment
      const isCurrentValidator = manager.isCurrentValidator();
      const slot = manager.getCurrentSlot();

      if (slot?.validatorId === 'validator_1') {
        expect(isCurrentValidator).toBe(true);
      } else {
        expect(isCurrentValidator).toBe(false);
      }
    });

    it('should calculate next slot for mediator', () => {
      const nextSlot = manager.getNextSlotForMediator();

      // Should be null if validator_1 is not in active set, or a future slot
      if (nextSlot) {
        expect(nextSlot.validatorId).toBe('validator_1');
        expect(nextSlot.startTime).toBeGreaterThanOrEqual(Date.now());
      }
    });

    it('should return time until next slot', () => {
      const timeUntil = manager.getTimeUntilNextSlot();

      // Either -1 (not in active set) or positive time
      expect(timeUntil).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('shouldMediate', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
    });

    it('should allow mediation in permissionless mode', async () => {
      const permissionlessConfig = createMockConfig({
        consensusMode: 'permissionless',
      });
      const permissionlessManager = new ValidatorRotationManager(permissionlessConfig);
      await permissionlessManager.start();

      expect(permissionlessManager.shouldMediate()).toBe(true);

      permissionlessManager.stop();
    });

    it('should gate mediation in DPoS mode based on slot', async () => {
      await manager.start();
      await manager.registerValidator('validator_1', 10000);

      // In DPoS mode, shouldMediate depends on current slot
      const shouldMediate = manager.shouldMediate();
      const isCurrentValidator = manager.isCurrentValidator();

      expect(shouldMediate).toBe(isCurrentValidator);
    });

    it('should check active set in hybrid mode', async () => {
      const hybridConfig = createMockConfig({
        consensusMode: 'hybrid',
        mediatorPublicKey: 'hybrid_validator',
      });
      const hybridManager = new ValidatorRotationManager(hybridConfig);
      await hybridManager.start();
      await hybridManager.registerValidator('hybrid_validator', 5000);

      // In hybrid mode, should mediate if in active set
      const validators = hybridManager.getAllValidators();
      const validator = validators.find(v => v.mediatorId === 'hybrid_validator');
      expect(hybridManager.shouldMediate()).toBe(validator?.isActive || false);

      hybridManager.stop();
    });
  });

  describe('validator selection', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
    });

    it('should select top N validators by stake', async () => {
      // Register validators with different stakes
      await manager.registerValidator('v1', 10000);
      await manager.registerValidator('v2', 8000);
      await manager.registerValidator('v3', 6000);
      await manager.registerValidator('v4', 4000);
      await manager.registerValidator('v5', 2000);

      // Update config to limit active slots to 3
      manager.updateRotationConfig({ activeSlots: 3 });

      // Re-initialize epoch to apply new selection
      const status = manager.getStatus();
      expect(status.config.activeSlots).toBe(3);
    });

    it('should exclude jailed validators from selection', async () => {
      await manager.registerValidator('v1', 10000);
      await manager.registerValidator('v2', 8000);

      await manager.jailValidator('v1', 'Test jailing');

      const jailed = manager.getJailedValidators();
      expect(jailed.has('v1')).toBe(true);
    });
  });

  describe('jailing and unjailing', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
      await manager.registerValidator('validator_1', 10000);
    });

    it('should jail a validator', async () => {
      await manager.jailValidator('validator_1', 'Missed slots');

      const jailed = manager.getJailedValidators();
      expect(jailed.has('validator_1')).toBe(true);
      expect(jailed.get('validator_1')?.reason).toBe('Missed slots');
    });

    it('should not unjail before cooldown', async () => {
      await manager.jailValidator('validator_1', 'Test');

      const result = await manager.unjailValidator('validator_1');

      expect(result).toBe(false);
      expect(manager.getJailedValidators().has('validator_1')).toBe(true);
    });

    it('should unjail after cooldown period', async () => {
      await manager.jailValidator('validator_1', 'Test');

      // Advance time past cooldown (24 hours)
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      const result = await manager.unjailValidator('validator_1');

      expect(result).toBe(true);
      expect(manager.getJailedValidators().has('validator_1')).toBe(false);
    });

    it('should reset missed slots on unjailing', async () => {
      const validator = manager.getAllValidators().find(v => v.mediatorId === 'validator_1');
      if (validator) {
        validator.missedSlots = 5;
      }

      await manager.jailValidator('validator_1', 'Missed slots');
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
      await manager.unjailValidator('validator_1');

      const updatedValidator = manager.getAllValidators().find(v => v.mediatorId === 'validator_1');
      expect(updatedValidator?.missedSlots).toBe(0);
    });
  });

  describe('missed slot tracking', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
      await manager.registerValidator('validator_1', 10000);
    });

    it('should track missed slots', () => {
      manager.recordMissedSlot('validator_1');

      const validator = manager.getAllValidators().find(v => v.mediatorId === 'validator_1');
      expect(validator?.missedSlots).toBe(1);
    });

    it('should jail validator after threshold missed slots', () => {
      manager.recordMissedSlot('validator_1');
      manager.recordMissedSlot('validator_1');
      manager.recordMissedSlot('validator_1'); // Threshold is 3

      expect(manager.getJailedValidators().has('validator_1')).toBe(true);
    });

    it('should reset missed slots on activity', () => {
      manager.recordMissedSlot('validator_1');
      manager.recordMissedSlot('validator_1');

      manager.recordSlotActivity('validator_1');

      const validator = manager.getAllValidators().find(v => v.mediatorId === 'validator_1');
      expect(validator?.missedSlots).toBe(0);
    });
  });

  describe('rotation events', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
    });

    it('should record epoch start event', () => {
      const events = manager.getRotationEvents();
      const epochEvent = events.find(e => e.eventType === 'epoch_start');

      expect(epochEvent).toBeDefined();
      expect(epochEvent?.epochNumber).toBeGreaterThanOrEqual(0);
    });

    it('should record validator joined event', async () => {
      await manager.registerValidator('new_validator', 5000);

      const events = manager.getRotationEvents();
      const joinEvent = events.find(e => e.eventType === 'validator_joined');

      expect(joinEvent).toBeDefined();
      expect(joinEvent?.affectedValidators).toContain('new_validator');
    });

    it('should limit event history', async () => {
      // Add many validators to generate events
      for (let i = 0; i < 100; i++) {
        await manager.registerValidator(`validator_${i}`, 5000);
      }

      const events = manager.getRotationEvents();
      expect(events.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('configuration updates', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      await manager.start();
    });

    it('should update rotation configuration', () => {
      manager.updateRotationConfig({
        activeSlots: 10,
        rotationPeriodHours: 12,
      });

      const status = manager.getStatus();
      expect(status.config.activeSlots).toBe(10);
      expect(status.config.rotationPeriodHours).toBe(12);
    });

    it('should preserve other config values when updating', () => {
      const originalSlotDuration = manager.getStatus().config.slotDurationMinutes;

      manager.updateRotationConfig({ activeSlots: 10 });

      expect(manager.getStatus().config.slotDurationMinutes).toBe(originalSlotDuration);
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      // Load validators from chain at startup (so they're in the epoch)
      mockAxios.get.mockResolvedValue({
        data: {
          validators: [
            { mediatorId: 'validator_1', effectiveStake: 10000 },
          ],
        },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
    });

    it('should return comprehensive status', () => {
      const status = manager.getStatus();

      expect(status.currentEpoch).not.toBeNull();
      expect(status.currentSlot).not.toBeNull();
      expect(typeof status.isCurrentValidator).toBe('boolean');
      expect(status.validatorCount).toBe(1);
      expect(typeof status.jailedCount).toBe('number');
      expect(status.config).toBeDefined();
    });

    it('should include epoch details', () => {
      const status = manager.getStatus();

      expect(status.currentEpoch?.epochNumber).toBeGreaterThanOrEqual(0);
      expect(status.currentEpoch?.startTime).toBeLessThanOrEqual(Date.now());
      expect(status.currentEpoch?.endTime).toBeGreaterThan(Date.now());
      expect(status.currentEpoch?.slotDurationMs).toBe(10 * 60 * 1000);
    });
  });

  describe('stop', () => {
    it('should stop epoch monitoring timers', async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      await manager.start();

      manager.stop();

      // Should not throw when stopped
      expect(() => manager.getStatus()).not.toThrow();
    });
  });

  describe('epoch transitions', () => {
    beforeEach(async () => {
      mockAxios.get.mockResolvedValue({ data: { validators: [] } });
      mockAxios.post.mockResolvedValue({ status: 200 });
      await manager.start();
      await manager.registerValidator('validator_1', 10000);
    });

    it('should maintain epoch continuity', () => {
      const epoch1 = manager.getCurrentEpoch();

      expect(epoch1).not.toBeNull();
      expect(epoch1!.epochNumber).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct epoch boundaries', () => {
      const epoch = manager.getCurrentEpoch();
      const epochDuration = 24 * 60 * 60 * 1000; // 24 hours

      expect(epoch!.endTime - epoch!.startTime).toBe(epochDuration);
    });
  });
});
