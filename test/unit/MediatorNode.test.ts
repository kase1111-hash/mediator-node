import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig } from '../../src/types';
import { createMockConfig, createMockIntent } from '../utils/testUtils';

// Mock axios
jest.mock('axios');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock all the component classes
jest.mock('../../src/ingestion/IntentIngester');
jest.mock('../../src/mapping/VectorDatabase');
jest.mock('../../src/llm/LLMProvider');
jest.mock('../../src/settlement/SettlementManager');
jest.mock('../../src/reputation/ReputationTracker');
jest.mock('../../src/consensus/StakeManager');
jest.mock('../../src/consensus/AuthorityManager');
jest.mock('../../src/consensus/ValidatorRotationManager');
jest.mock('../../src/burn/BurnManager');
jest.mock('../../src/burn/LoadMonitor');
jest.mock('../../src/challenge/ChallengeDetector');
jest.mock('../../src/challenge/ChallengeManager');
jest.mock('../../src/consensus/SemanticConsensusManager');
jest.mock('../../src/sybil/SubmissionTracker');
jest.mock('../../src/sybil/SpamProofDetector');
jest.mock('../../src/effort/EffortCaptureSystem');
jest.mock('../../src/dispute/DisputeManager');
jest.mock('../../src/licensing/LicensingManager');
jest.mock('../../src/settlement/MP05SettlementCoordinator');
jest.mock('../../src/websocket/WebSocketServer');
jest.mock('../../src/websocket/EventPublisher');
jest.mock('../../src/monitoring/HealthMonitor');
jest.mock('../../src/monitoring/PerformanceAnalytics');
jest.mock('../../src/monitoring/MonitoringPublisher');
jest.mock('../../src/governance/GovernanceManager');

// Import mocked modules
import { IntentIngester } from '../../src/ingestion/IntentIngester';
import { VectorDatabase } from '../../src/mapping/VectorDatabase';
import { LLMProvider } from '../../src/llm/LLMProvider';
import { SettlementManager } from '../../src/settlement/SettlementManager';
import { ReputationTracker } from '../../src/reputation/ReputationTracker';
import { StakeManager } from '../../src/consensus/StakeManager';
import { AuthorityManager } from '../../src/consensus/AuthorityManager';
import { ValidatorRotationManager } from '../../src/consensus/ValidatorRotationManager';
import { BurnManager } from '../../src/burn/BurnManager';
import { LoadMonitor } from '../../src/burn/LoadMonitor';
import { ChallengeDetector } from '../../src/challenge/ChallengeDetector';
import { ChallengeManager } from '../../src/challenge/ChallengeManager';
import { SemanticConsensusManager } from '../../src/consensus/SemanticConsensusManager';
import { SubmissionTracker } from '../../src/sybil/SubmissionTracker';
import { SpamProofDetector } from '../../src/sybil/SpamProofDetector';
import { EffortCaptureSystem } from '../../src/effort/EffortCaptureSystem';
import { DisputeManager } from '../../src/dispute/DisputeManager';
import { LicensingManager } from '../../src/licensing/LicensingManager';
import { WebSocketServer } from '../../src/websocket/WebSocketServer';
import { HealthMonitor } from '../../src/monitoring/HealthMonitor';
import { PerformanceAnalytics } from '../../src/monitoring/PerformanceAnalytics';
import { GovernanceManager } from '../../src/governance/GovernanceManager';
import { logger } from '../../src/utils/logger';

// Get mock implementations
const MockIntentIngester = IntentIngester as jest.MockedClass<typeof IntentIngester>;
const MockVectorDatabase = VectorDatabase as jest.MockedClass<typeof VectorDatabase>;
const MockLLMProvider = LLMProvider as jest.MockedClass<typeof LLMProvider>;
const MockSettlementManager = SettlementManager as jest.MockedClass<typeof SettlementManager>;
const MockReputationTracker = ReputationTracker as jest.MockedClass<typeof ReputationTracker>;
const MockStakeManager = StakeManager as jest.MockedClass<typeof StakeManager>;
const MockAuthorityManager = AuthorityManager as jest.MockedClass<typeof AuthorityManager>;
const MockValidatorRotationManager = ValidatorRotationManager as jest.MockedClass<typeof ValidatorRotationManager>;
const MockBurnManager = BurnManager as jest.MockedClass<typeof BurnManager>;
const MockSubmissionTracker = SubmissionTracker as jest.MockedClass<typeof SubmissionTracker>;
const MockSpamProofDetector = SpamProofDetector as jest.MockedClass<typeof SpamProofDetector>;
const MockLoadMonitor = LoadMonitor as jest.MockedClass<typeof LoadMonitor>;
const MockHealthMonitor = HealthMonitor as jest.MockedClass<typeof HealthMonitor>;
const MockWebSocketServer = WebSocketServer as jest.MockedClass<typeof WebSocketServer>;

describe('MediatorNode', () => {
  let config: MediatorConfig;
  let node: MediatorNode;

  // Default mock implementations
  const setupDefaultMocks = () => {
    // IntentIngester mocks
    MockIntentIngester.prototype.startPolling = jest.fn();
    MockIntentIngester.prototype.stopPolling = jest.fn();
    MockIntentIngester.prototype.getCachedIntents = jest.fn().mockReturnValue([]);
    MockIntentIngester.prototype.getPrioritizedIntents = jest.fn().mockReturnValue([]);

    // VectorDatabase mocks
    MockVectorDatabase.prototype.initialize = jest.fn().mockResolvedValue(undefined);
    MockVectorDatabase.prototype.save = jest.fn().mockResolvedValue(undefined);
    MockVectorDatabase.prototype.addIntent = jest.fn().mockResolvedValue(undefined);
    MockVectorDatabase.prototype.findTopAlignmentCandidates = jest.fn().mockResolvedValue([]);

    // LLMProvider mocks
    MockLLMProvider.prototype.generateEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    MockLLMProvider.prototype.negotiateAlignment = jest.fn().mockResolvedValue({
      success: false,
      reasoning: 'Test failure',
    });

    // ReputationTracker mocks
    MockReputationTracker.prototype.loadReputation = jest.fn().mockResolvedValue(undefined);
    MockReputationTracker.prototype.getWeight = jest.fn().mockReturnValue(1.0);

    // StakeManager mocks
    MockStakeManager.prototype.loadDelegations = jest.fn().mockResolvedValue(undefined);
    MockStakeManager.prototype.bondStake = jest.fn().mockResolvedValue(true);
    MockStakeManager.prototype.meetsMinimumStake = jest.fn().mockReturnValue(true);
    MockStakeManager.prototype.getEffectiveStake = jest.fn().mockReturnValue(1000);
    MockStakeManager.prototype.getStake = jest.fn().mockReturnValue({
      mediatorId: 'test-public-key',
      amount: 1000,
      delegatedAmount: 0,
      effectiveStake: 1000,
      delegators: [],
      status: 'bonded',
    });

    // AuthorityManager mocks
    MockAuthorityManager.prototype.loadAuthoritySet = jest.fn().mockResolvedValue(undefined);
    MockAuthorityManager.prototype.checkAuthorization = jest.fn().mockReturnValue(true);

    // ValidatorRotationManager mocks
    MockValidatorRotationManager.prototype.start = jest.fn().mockResolvedValue(undefined);
    MockValidatorRotationManager.prototype.stop = jest.fn();
    MockValidatorRotationManager.prototype.registerValidator = jest.fn().mockResolvedValue(undefined);
    MockValidatorRotationManager.prototype.isCurrentValidator = jest.fn().mockReturnValue(true);
    MockValidatorRotationManager.prototype.shouldMediate = jest.fn().mockReturnValue(true);
    MockValidatorRotationManager.prototype.getCurrentEpoch = jest.fn().mockReturnValue({ epochNumber: 1 });
    MockValidatorRotationManager.prototype.getCurrentSlot = jest.fn().mockReturnValue(null);
    MockValidatorRotationManager.prototype.getNextSlotForMediator = jest.fn().mockReturnValue(null);
    MockValidatorRotationManager.prototype.getTimeUntilNextSlot = jest.fn().mockReturnValue(0);
    MockValidatorRotationManager.prototype.recordSlotActivity = jest.fn();
    MockValidatorRotationManager.prototype.getStatus = jest.fn().mockReturnValue({});

    // BurnManager mocks
    MockBurnManager.prototype.getBurnStats = jest.fn().mockReturnValue({
      totalBurns: 0,
      totalAmount: 0,
    });
    MockBurnManager.prototype.getLoadMultiplier = jest.fn().mockReturnValue(1.0);
    MockBurnManager.prototype.getBurnAnalytics = jest.fn().mockReturnValue({
      recordLoadMultiplier: jest.fn(),
    });

    // LoadMonitor mocks
    MockLoadMonitor.prototype.startMonitoring = jest.fn();
    MockLoadMonitor.prototype.stopMonitoring = jest.fn();
    MockLoadMonitor.prototype.getLoadStats = jest.fn().mockReturnValue({
      currentMetrics: {
        intentSubmissionRate: 0,
        activeIntentCount: 0,
        settlementRate: 0,
      },
      currentMultiplier: 1.0,
      loadFactor: 0,
    });
    MockLoadMonitor.prototype.getCurrentMetrics = jest.fn().mockReturnValue({
      intentSubmissionRate: 0,
      activeIntentCount: 0,
      settlementRate: 0,
    });
    MockLoadMonitor.prototype.getLoadMultiplier = jest.fn().mockReturnValue(1.0);

    // SettlementManager mocks
    MockSettlementManager.prototype.monitorSettlements = jest.fn().mockResolvedValue(undefined);
    MockSettlementManager.prototype.getActiveSettlements = jest.fn().mockReturnValue([]);
    MockSettlementManager.prototype.createSettlement = jest.fn().mockReturnValue({
      id: 'test-settlement',
      status: 'proposed',
    });
    MockSettlementManager.prototype.submitSettlement = jest.fn().mockResolvedValue(true);

    // ChallengeManager mocks
    (ChallengeManager as jest.MockedClass<typeof ChallengeManager>).prototype.monitorChallenges = jest.fn().mockResolvedValue(undefined);
    (ChallengeManager as jest.MockedClass<typeof ChallengeManager>).prototype.getChallengesForSettlement = jest.fn().mockReturnValue([]);
    (ChallengeManager as jest.MockedClass<typeof ChallengeManager>).prototype.getChallengeStats = jest.fn().mockReturnValue({
      total: 0,
      pending: 0,
      upheld: 0,
      rejected: 0,
      successRate: 0,
    });

    // ChallengeDetector mocks
    (ChallengeDetector as jest.MockedClass<typeof ChallengeDetector>).prototype.analyzeSettlement = jest.fn().mockResolvedValue(null);
    (ChallengeDetector as jest.MockedClass<typeof ChallengeDetector>).prototype.shouldChallenge = jest.fn().mockReturnValue(false);

    // SemanticConsensusManager mocks
    (SemanticConsensusManager as jest.MockedClass<typeof SemanticConsensusManager>).prototype.checkVerificationTimeouts = jest.fn().mockResolvedValue(undefined);
    (SemanticConsensusManager as jest.MockedClass<typeof SemanticConsensusManager>).prototype.getVerificationStats = jest.fn().mockReturnValue({
      total: 0,
      pending: 0,
      inProgress: 0,
      consensusReached: 0,
      consensusFailed: 0,
      timedOut: 0,
    });

    // WebSocketServer mocks
    MockWebSocketServer.prototype.start = jest.fn().mockResolvedValue(undefined);
    MockWebSocketServer.prototype.stop = jest.fn().mockResolvedValue(undefined);
    MockWebSocketServer.prototype.getConnections = jest.fn().mockReturnValue([]);

    // HealthMonitor mocks
    MockHealthMonitor.prototype.start = jest.fn();
    MockHealthMonitor.prototype.stop = jest.fn();
    MockHealthMonitor.prototype.registerComponent = jest.fn();
    (HealthMonitor as any).createSimpleChecker = jest.fn().mockReturnValue(() => Promise.resolve({ status: 'healthy' }));

    // PerformanceAnalytics mocks
    (PerformanceAnalytics as jest.MockedClass<typeof PerformanceAnalytics>).prototype.start = jest.fn();
    (PerformanceAnalytics as jest.MockedClass<typeof PerformanceAnalytics>).prototype.stop = jest.fn();

    // GovernanceManager mocks
    (GovernanceManager as jest.MockedClass<typeof GovernanceManager>).prototype.start = jest.fn();
    (GovernanceManager as jest.MockedClass<typeof GovernanceManager>).prototype.stop = jest.fn();

    // EffortCaptureSystem mocks
    (EffortCaptureSystem as jest.MockedClass<typeof EffortCaptureSystem>).prototype.start = jest.fn();
    (EffortCaptureSystem as jest.MockedClass<typeof EffortCaptureSystem>).prototype.stop = jest.fn();
    (EffortCaptureSystem as jest.MockedClass<typeof EffortCaptureSystem>).prototype.getStatus = jest.fn().mockReturnValue({
      isRunning: true,
      receipts: {
        totalReceipts: 0,
        totalSignals: 0,
        totalDurationMinutes: 0,
        receiptsByStatus: {},
      },
      anchoring: {
        totalAnchored: 0,
      },
    });

    // DisputeManager mocks
    (DisputeManager as jest.MockedClass<typeof DisputeManager>).prototype.getStats = jest.fn().mockReturnValue({});

    // LicensingManager mocks
    (LicensingManager as jest.MockedClass<typeof LicensingManager>).prototype.getStats = jest.fn().mockReturnValue({});

    // SubmissionTracker mocks
    MockSubmissionTracker.prototype.processRefunds = jest.fn().mockResolvedValue(undefined);
    MockSubmissionTracker.prototype.getStats = jest.fn().mockReturnValue({
      totalSubmissionsToday: 0,
      totalDeposits: 0,
      activeDeposits: 0,
      refundedDeposits: 0,
      forfeitedDeposits: 0,
      totalDepositValue: 0,
    });

    // SpamProofDetector mocks
    MockSpamProofDetector.prototype.monitorSpamProofs = jest.fn().mockResolvedValue(undefined);
    MockSpamProofDetector.prototype.analyzeIntent = jest.fn().mockResolvedValue(null);
    MockSpamProofDetector.prototype.getSubmittedProofs = jest.fn().mockReturnValue([]);
    MockSpamProofDetector.prototype.getSpamProofStats = jest.fn().mockReturnValue({
      total: 0,
      pending: 0,
      validated: 0,
      rejected: 0,
      totalForfeited: 0,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setupDefaultMocks();

    config = createMockConfig({
      mediatorPublicKey: 'test-public-key',
      chainEndpoint: 'http://localhost:3000',
      consensusMode: 'permissionless',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a mediator node with default config', () => {
      node = new MediatorNode(config);

      expect(node).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        'Mediator node created',
        expect.objectContaining({
          mediatorId: 'test-public-key',
          consensusMode: 'permissionless',
        })
      );
    });

    it('should initialize all core components', () => {
      node = new MediatorNode(config);

      expect(MockIntentIngester).toHaveBeenCalled();
      expect(MockVectorDatabase).toHaveBeenCalled();
      expect(MockLLMProvider).toHaveBeenCalled();
      expect(MockSettlementManager).toHaveBeenCalled();
      expect(MockReputationTracker).toHaveBeenCalled();
      expect(MockStakeManager).toHaveBeenCalled();
      expect(MockAuthorityManager).toHaveBeenCalled();
      expect(MockBurnManager).toHaveBeenCalled();
      expect(MockLoadMonitor).toHaveBeenCalled();
    });

    it('should initialize ValidatorRotationManager for DPoS mode', () => {
      config = createMockConfig({ consensusMode: 'dpos' });
      node = new MediatorNode(config);

      expect(MockValidatorRotationManager).toHaveBeenCalled();
    });

    it('should initialize ValidatorRotationManager for hybrid mode', () => {
      config = createMockConfig({ consensusMode: 'hybrid' });
      node = new MediatorNode(config);

      expect(MockValidatorRotationManager).toHaveBeenCalled();
    });

    it('should NOT initialize ValidatorRotationManager for permissionless mode', () => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      node = new MediatorNode(config);

      expect(MockValidatorRotationManager).not.toHaveBeenCalled();
    });

    it('should initialize EffortCaptureSystem when enabled', () => {
      config = createMockConfig({ enableEffortCapture: true });
      node = new MediatorNode(config);

      expect(EffortCaptureSystem).toHaveBeenCalled();
    });

    it('should NOT initialize EffortCaptureSystem when disabled', () => {
      config = createMockConfig({ enableEffortCapture: false });
      node = new MediatorNode(config);

      expect(EffortCaptureSystem).not.toHaveBeenCalled();
    });

    it('should initialize DisputeManager when enabled', () => {
      config = createMockConfig({ enableDisputeSystem: true });
      node = new MediatorNode(config);

      expect(DisputeManager).toHaveBeenCalled();
    });

    it('should initialize LicensingManager when enabled', () => {
      config = createMockConfig({ enableLicensingSystem: true });
      node = new MediatorNode(config);

      expect(LicensingManager).toHaveBeenCalled();
    });

    it('should initialize WebSocketServer when enabled', () => {
      config = createMockConfig({ enableWebSocket: true, webSocketPort: 8080 });
      node = new MediatorNode(config);

      expect(MockWebSocketServer).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 8080,
        })
      );
    });

    it('should initialize HealthMonitor when monitoring is enabled', () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);

      expect(MockHealthMonitor).toHaveBeenCalled();
    });

    it('should initialize GovernanceManager when enabled', () => {
      config = createMockConfig({ enableGovernance: true });
      node = new MediatorNode(config);

      expect(GovernanceManager).toHaveBeenCalled();
    });

    it('should log correct feature flags', () => {
      config = createMockConfig({
        enableChallengeSubmission: true,
        enableSemanticConsensus: true,
        enableSybilResistance: true,
        enableEffortCapture: true,
        enableDisputeSystem: true,
        enableWebSocket: true,
      });
      node = new MediatorNode(config);

      expect(logger.info).toHaveBeenCalledWith(
        'Mediator node created',
        expect.objectContaining({
          challengeSubmissionEnabled: true,
          semanticConsensusEnabled: true,
          sybilResistanceEnabled: true,
          effortCaptureEnabled: true,
          disputeSystemEnabled: true,
          webSocketEnabled: true,
        })
      );
    });
  });

  describe('start', () => {
    beforeEach(() => {
      node = new MediatorNode(config);
    });

    it('should start in permissionless mode successfully', async () => {
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockVectorDatabase.prototype.initialize).toHaveBeenCalled();
      expect(MockReputationTracker.prototype.loadReputation).toHaveBeenCalled();
      expect(MockIntentIngester.prototype.startPolling).toHaveBeenCalledWith(10000);
      expect(logger.info).toHaveBeenCalledWith('Mediator node started successfully', expect.any(Object));
    });

    it('should initialize vector database', async () => {
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockVectorDatabase.prototype.initialize).toHaveBeenCalled();
    });

    it('should load reputation', async () => {
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockReputationTracker.prototype.loadReputation).toHaveBeenCalled();
    });

    it('should start polling for intents', async () => {
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockIntentIngester.prototype.startPolling).toHaveBeenCalledWith(10000);
    });

    describe('DPoS mode', () => {
      beforeEach(() => {
        config = createMockConfig({
          consensusMode: 'dpos',
          bondedStakeAmount: 1000,
          minEffectiveStake: 500,
        });
        node = new MediatorNode(config);
      });

      it('should load delegations', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockStakeManager.prototype.loadDelegations).toHaveBeenCalled();
      });

      it('should bond stake if configured', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockStakeManager.prototype.bondStake).toHaveBeenCalledWith(1000);
      });

      it('should check minimum stake requirement', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockStakeManager.prototype.meetsMinimumStake).toHaveBeenCalled();
      });

      it('should NOT start if minimum stake not met', async () => {
        MockStakeManager.prototype.meetsMinimumStake.mockReturnValue(false);

        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(logger.error).toHaveBeenCalledWith('Cannot start: Minimum stake requirement not met');
        expect(MockIntentIngester.prototype.startPolling).not.toHaveBeenCalled();
      });

      it('should start validator rotation manager', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockValidatorRotationManager.prototype.start).toHaveBeenCalled();
        expect(MockValidatorRotationManager.prototype.registerValidator).toHaveBeenCalled();
      });
    });

    describe('PoA mode', () => {
      beforeEach(() => {
        config = createMockConfig({
          consensusMode: 'poa',
          poaAuthorityKey: 'authority-key-123',
        });
        node = new MediatorNode(config);
      });

      it('should load authority set', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockAuthorityManager.prototype.loadAuthoritySet).toHaveBeenCalled();
      });

      it('should check authorization', async () => {
        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(MockAuthorityManager.prototype.checkAuthorization).toHaveBeenCalled();
      });

      it('should NOT start if not authorized', async () => {
        MockAuthorityManager.prototype.checkAuthorization.mockReturnValue(false);

        const startPromise = node.start();
        jest.advanceTimersByTime(100);
        await startPromise;

        expect(logger.error).toHaveBeenCalledWith('Cannot start: Not authorized in PoA mode');
        expect(MockIntentIngester.prototype.startPolling).not.toHaveBeenCalled();
      });
    });

    it('should start load monitoring when enabled', async () => {
      config = createMockConfig({ loadScalingEnabled: true, loadMonitoringInterval: 5000 });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockLoadMonitor.prototype.startMonitoring).toHaveBeenCalledWith(5000);
    });

    it('should start WebSocket server when enabled', async () => {
      config = createMockConfig({ enableWebSocket: true });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockWebSocketServer.prototype.start).toHaveBeenCalled();
    });

    it('should start health monitoring when enabled', async () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockHealthMonitor.prototype.start).toHaveBeenCalled();
    });

    it('should register health checkers', async () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockHealthMonitor.prototype.registerComponent).toHaveBeenCalled();
    });

    it('should start governance system when enabled', async () => {
      config = createMockConfig({ enableGovernance: true });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(GovernanceManager.prototype.start).toHaveBeenCalled();
    });

    it('should start effort capture system when enabled', async () => {
      config = createMockConfig({ enableEffortCapture: true });
      node = new MediatorNode(config);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(EffortCaptureSystem.prototype.start).toHaveBeenCalled();
    });

    it('should handle errors during start', async () => {
      MockVectorDatabase.prototype.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(node.start()).rejects.toThrow('Init failed');
      expect(logger.error).toHaveBeenCalledWith('Error starting mediator node', expect.any(Object));
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;
    });

    it('should stop polling', async () => {
      await node.stop();

      expect(MockIntentIngester.prototype.stopPolling).toHaveBeenCalled();
    });

    it('should stop load monitoring', async () => {
      await node.stop();

      expect(MockLoadMonitor.prototype.stopMonitoring).toHaveBeenCalled();
    });

    it('should save vector database', async () => {
      await node.stop();

      expect(MockVectorDatabase.prototype.save).toHaveBeenCalled();
    });

    it('should log stopped message', async () => {
      await node.stop();

      expect(logger.info).toHaveBeenCalledWith('Mediator node stopped');
    });

    it('should stop validator rotation manager in DPoS mode', async () => {
      config = createMockConfig({ consensusMode: 'dpos' });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      await node.stop();

      expect(MockValidatorRotationManager.prototype.stop).toHaveBeenCalled();
    });

    it('should stop effort capture system when enabled', async () => {
      config = createMockConfig({ enableEffortCapture: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      await node.stop();

      expect(EffortCaptureSystem.prototype.stop).toHaveBeenCalled();
    });

    it('should stop WebSocket server when enabled', async () => {
      config = createMockConfig({ enableWebSocket: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      await node.stop();

      expect(MockWebSocketServer.prototype.stop).toHaveBeenCalled();
    });

    it('should stop health monitoring when enabled', async () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      await node.stop();

      expect(MockHealthMonitor.prototype.stop).toHaveBeenCalled();
    });

    it('should stop governance system when enabled', async () => {
      config = createMockConfig({ enableGovernance: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      await node.stop();

      expect(GovernanceManager.prototype.stop).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      MockVectorDatabase.prototype.save.mockRejectedValue(new Error('Save failed'));

      await node.stop();

      // Should still log stopped message even if cleanup fails
      expect(logger.info).toHaveBeenCalledWith('Mediator node stopped');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup operation failed'),
        expect.any(Object)
      );
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      node = new MediatorNode(config);
    });

    it('should return running state correctly', () => {
      const status = node.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should return running true after start', async () => {
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      const status = node.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should return cached intents count', () => {
      MockIntentIngester.prototype.getCachedIntents.mockReturnValue([
        createMockIntent(),
        createMockIntent(),
      ]);

      const status = node.getStatus();
      expect(status.cachedIntents).toBe(2);
    });

    it('should return active settlements count', () => {
      MockSettlementManager.prototype.getActiveSettlements.mockReturnValue([
        { id: 'test1' } as any,
        { id: 'test2' } as any,
      ]);

      const status = node.getStatus();
      expect(status.activeSettlements).toBe(2);
    });

    it('should return reputation weight', () => {
      MockReputationTracker.prototype.getWeight.mockReturnValue(5.5);

      const status = node.getStatus();
      expect(status.reputation).toBe(5.5);
    });

    it('should return effective stake', () => {
      MockStakeManager.prototype.getEffectiveStake.mockReturnValue(2000);

      const status = node.getStatus();
      expect(status.effectiveStake).toBe(2000);
    });

    it('should return burn stats', () => {
      MockBurnManager.prototype.getBurnStats.mockReturnValue({
        totalBurns: 10,
        totalAmount: 500,
        byType: {},
        activeUsers: 5,
      } as any);
      MockBurnManager.prototype.getLoadMultiplier.mockReturnValue(1.5);

      const status = node.getStatus();
      expect(status.burnStats).toEqual({
        totalBurns: 10,
        totalAmount: 500,
        loadMultiplier: 1.5,
      });
    });

    it('should include load stats when enabled', () => {
      config = createMockConfig({ loadScalingEnabled: true });
      node = new MediatorNode(config);

      MockLoadMonitor.prototype.getLoadStats.mockReturnValue({
        currentMetrics: {
          intentSubmissionRate: 5,
          activeIntentCount: 100,
          settlementRate: 2,
          avgBurnAmount: 10,
          timestamp: Date.now(),
        },
        currentMultiplier: 1.2,
        loadFactor: 0.5,
        targetRate: 100,
        maxRate: 200,
        historicalAverage: {
          intentRate: 5,
          settlementRate: 2,
          avgBurn: 10,
        },
      } as any);

      const status = node.getStatus();
      expect(status.loadStats).toBeDefined();
      expect(status.loadStats?.intentSubmissionRate).toBe(5);
      expect(status.loadStats?.currentMultiplier).toBe(1.2);
    });

    it('should include challenge stats when enabled', () => {
      config = createMockConfig({ enableChallengeSubmission: true });
      node = new MediatorNode(config);

      const status = node.getStatus();
      expect(status.challengeStats).toBeDefined();
    });

    it('should include verification stats when semantic consensus enabled', () => {
      config = createMockConfig({ enableSemanticConsensus: true });
      node = new MediatorNode(config);

      const status = node.getStatus();
      expect(status.verificationStats).toBeDefined();
    });

    it('should include effort capture stats when enabled', () => {
      config = createMockConfig({ enableEffortCapture: true });
      node = new MediatorNode(config);

      const status = node.getStatus();
      expect(status.effortCaptureStats).toBeDefined();
    });

    it('should include dispute stats when enabled', () => {
      config = createMockConfig({ enableDisputeSystem: true });
      node = new MediatorNode(config);

      const status = node.getStatus();
      expect(status.disputeStats).toBeDefined();
    });

    it('should include licensing stats when enabled', () => {
      config = createMockConfig({ enableLicensingSystem: true });
      node = new MediatorNode(config);

      const status = node.getStatus();
      expect(status.licensingStats).toBeDefined();
    });
  });

  describe('getter methods', () => {
    beforeEach(() => {
      node = new MediatorNode(config);
    });

    it('should return BurnManager', () => {
      expect(node.getBurnManager()).toBeDefined();
    });

    it('should return IntentIngester', () => {
      expect(node.getIntentIngester()).toBeDefined();
    });

    it('should return LoadMonitor', () => {
      expect(node.getLoadMonitor()).toBeDefined();
    });

    it('should return SettlementManager', () => {
      expect(node.getSettlementManager()).toBeDefined();
    });

    it('should return ChallengeDetector', () => {
      expect(node.getChallengeDetector()).toBeDefined();
    });

    it('should return ChallengeManager', () => {
      expect(node.getChallengeManager()).toBeDefined();
    });

    it('should return SemanticConsensusManager', () => {
      expect(node.getSemanticConsensusManager()).toBeDefined();
    });

    it('should return undefined for optional components when not enabled', () => {
      expect(node.getDisputeManager()).toBeUndefined();
      expect(node.getLicensingManager()).toBeUndefined();
      expect(node.getMP05Coordinator()).toBeUndefined();
      expect(node.getWebSocketServer()).toBeUndefined();
      expect(node.getEventPublisher()).toBeUndefined();
      expect(node.getGovernanceManager()).toBeUndefined();
    });

    it('should return WebSocketServer when enabled', () => {
      config = createMockConfig({ enableWebSocket: true });
      node = new MediatorNode(config);

      expect(node.getWebSocketServer()).toBeDefined();
    });

    it('should return DisputeManager when enabled', () => {
      config = createMockConfig({ enableDisputeSystem: true });
      node = new MediatorNode(config);

      expect(node.getDisputeManager()).toBeDefined();
    });

    it('should return GovernanceManager when enabled', () => {
      config = createMockConfig({ enableGovernance: true });
      node = new MediatorNode(config);

      expect(node.getGovernanceManager()).toBeDefined();
    });

    it('should return HealthMonitor when enabled', () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);

      expect(node.getHealthMonitor()).toBeDefined();
    });

    it('should return PerformanceAnalytics when enabled', () => {
      config = createMockConfig({ enableMonitoring: true });
      node = new MediatorNode(config);

      expect(node.getPerformanceAnalytics()).toBeDefined();
    });
  });

  describe('alignment cycle', () => {
    beforeEach(async () => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      node = new MediatorNode(config);
    });

    it('should run alignment cycle periodically', async () => {
      const mockIntents = [createMockIntent({ hash: 'intent1' }), createMockIntent({ hash: 'intent2' })];
      MockIntentIngester.prototype.getPrioritizedIntents.mockReturnValue(mockIntents);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      // Advance timers to trigger alignment cycle
      jest.advanceTimersByTime(30000);

      expect(MockIntentIngester.prototype.getPrioritizedIntents).toHaveBeenCalled();
    });

    it('should generate embeddings for new intents', async () => {
      const mockIntents = [createMockIntent({ hash: 'intent1', prose: 'Test intent' })];
      MockIntentIngester.prototype.getPrioritizedIntents.mockReturnValue(mockIntents);
      MockVectorDatabase.prototype.findTopAlignmentCandidates.mockResolvedValue([]);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockLLMProvider.prototype.generateEmbedding).toHaveBeenCalled();
    });

    it('should skip alignment cycle when no intents', async () => {
      MockIntentIngester.prototype.getPrioritizedIntents.mockReturnValue([]);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      expect(MockVectorDatabase.prototype.findTopAlignmentCandidates).not.toHaveBeenCalled();
    });

    it('should handle errors in alignment cycle gracefully', async () => {
      MockIntentIngester.prototype.getPrioritizedIntents.mockImplementation(() => {
        throw new Error('Intent fetch failed');
      });

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      // Should log error but not crash
      expect(logger.error).toHaveBeenCalledWith('Error in alignment cycle', expect.any(Object));
    });

    it('should respect DPoS slot-based gating', async () => {
      config = createMockConfig({ consensusMode: 'dpos' });
      node = new MediatorNode(config);

      MockValidatorRotationManager.prototype.shouldMediate.mockReturnValue(false);

      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      // Should not process intents when not our slot
      expect(MockIntentIngester.prototype.getPrioritizedIntents).not.toHaveBeenCalled();
    });
  });

  describe('settlement monitoring', () => {
    beforeEach(async () => {
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;
    });

    it('should start settlement monitoring interval', () => {
      // Advance timer to trigger monitoring
      jest.advanceTimersByTime(60000);

      expect(MockSettlementManager.prototype.monitorSettlements).toHaveBeenCalled();
    });

    it('should handle errors in settlement monitoring gracefully', async () => {
      MockSettlementManager.prototype.monitorSettlements.mockRejectedValue(new Error('Monitor failed'));

      jest.advanceTimersByTime(60000);

      // Wait for async error handling
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        'Error in settlement monitoring interval',
        expect.any(Object)
      );
    });
  });

  describe('challenge monitoring', () => {
    beforeEach(async () => {
      config = createMockConfig({ enableChallengeSubmission: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;
    });

    it('should monitor challenges when enabled', () => {
      jest.advanceTimersByTime(60000);

      expect(ChallengeManager.prototype.monitorChallenges).toHaveBeenCalled();
    });
  });

  describe('sybil resistance monitoring', () => {
    it('should start sybil resistance monitoring when enabled', async () => {
      config = createMockConfig({ enableSybilResistance: true });
      node = new MediatorNode(config);
      const startPromise = node.start();
      jest.advanceTimersByTime(100);
      await startPromise;

      // Sybil resistance should be active
      expect(logger.info).toHaveBeenCalledWith(
        'Mediator node started successfully',
        expect.objectContaining({
          sybilResistance: true,
        })
      );
    });
  });
});
