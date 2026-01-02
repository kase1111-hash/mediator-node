/**
 * Unit tests for SecurityAppsManager
 *
 * Tests the unified security apps manager that coordinates
 * Boundary Daemon and Boundary SIEM integrations.
 *
 * @see https://github.com/kase1111-hash/boundary-daemon-
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 */

import axios from 'axios';
import {
  SecurityAppsManager,
  SecurityAppsHealth,
  SecurityActionContext,
  getSecurityAppsManager,
  resetSecurityAppsManager,
} from '../../../src/security/SecurityAppsManager';
import { SecurityAppsConfig } from '../../../src/security/SecurityAppsConfig';
import { BoundaryDaemonClient } from '../../../src/security/BoundaryDaemonClient';
import { BoundarySIEMClient } from '../../../src/security/BoundarySIEMClient';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SecurityAppsManager', () => {
  let manager: SecurityAppsManager;
  let mockAxiosInstance: any;

  const fullConfig: Partial<SecurityAppsConfig> = {
    enabled: true,
    boundaryDaemon: {
      enabled: true,
      baseUrl: 'http://daemon:9000',
      apiToken: 'daemon-token',
      timeout: 5000,
      failOpen: false,
      retryAttempts: 3,
    },
    boundarySIEM: {
      enabled: true,
      baseUrl: 'http://siem:8080',
      apiToken: 'siem-token',
      timeout: 10000,
      batchEnabled: false,
      batchSize: 100,
      batchFlushInterval: 5000,
      retryAttempts: 3,
      sourceId: 'test-mediator',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetSecurityAppsManager();

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
  });

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create manager with default configuration', () => {
      // Set env vars to enable security apps
      const originalEnv = { ...process.env };
      process.env.BOUNDARY_DAEMON_ENABLED = 'false';
      process.env.BOUNDARY_SIEM_ENABLED = 'false';

      manager = new SecurityAppsManager();
      expect(manager.isInitialized()).toBe(false);

      process.env = originalEnv;
    });

    it('should create manager with custom configuration', () => {
      manager = new SecurityAppsManager(fullConfig);
      expect(manager.isInitialized()).toBe(false); // Not initialized until initialize() is called
    });
  });

  describe('initialize', () => {
    it('should initialize both clients when enabled', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getDaemonClient()).not.toBeNull();
      expect(manager.getSIEMClient()).not.toBeNull();
    });

    it('should handle daemon connection failure gracefully', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Daemon unreachable')) // Daemon health
        .mockResolvedValue({ status: 200 }); // SIEM health

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getDaemonClient()?.isConnected()).toBe(false);
    });

    it('should handle SIEM connection failure gracefully', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({ status: 200, data: { mode: 'OPEN' } }) // Daemon health
        .mockRejectedValue(new Error('SIEM unreachable')); // SIEM health

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getSIEMClient()?.isConnected()).toBe(false);
    });

    it('should skip initialization when disabled', async () => {
      manager = new SecurityAppsManager({
        enabled: false,
        boundaryDaemon: { enabled: false, baseUrl: '', timeout: 0, failOpen: false, retryAttempts: 0 },
        boundarySIEM: { enabled: false, baseUrl: '', timeout: 0, batchEnabled: false, batchSize: 0, batchFlushInterval: 0, retryAttempts: 0, sourceId: '' },
      });
      await manager.initialize();

      expect(manager.getDaemonClient()).toBeNull();
      expect(manager.getSIEMClient()).toBeNull();
    });
  });

  describe('isActionAllowed', () => {
    it('should return true when daemon allows action', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          allowed: true,
          mode: 'OPEN',
          timestamp: Date.now(),
          decisionId: 'dec-1',
        },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const allowed = await manager.isActionAllowed('test_action', 'test_resource');

      expect(allowed).toBe(true);
    });

    it('should return false when daemon denies action', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'LOCKDOWN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          allowed: false,
          mode: 'LOCKDOWN',
          reason: 'Action denied',
          timestamp: Date.now(),
          decisionId: 'dec-2',
        },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const allowed = await manager.isActionAllowed('network_access', 'external');

      expect(allowed).toBe(false);
    });

    it('should return true when daemon is not configured', async () => {
      manager = new SecurityAppsManager({
        ...fullConfig,
        boundaryDaemon: { ...fullConfig.boundaryDaemon!, enabled: false },
      });
      await manager.initialize();

      const allowed = await manager.isActionAllowed('any_action', 'any_resource');

      expect(allowed).toBe(true);
    });
  });

  describe('requestPolicyDecision', () => {
    it('should return full decision from daemon', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'RESTRICTED' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          allowed: true,
          mode: 'RESTRICTED',
          reason: 'Allowed in restricted mode',
          memoryClass: 2,
          timestamp: Date.now(),
          decisionId: 'dec-3',
        },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const decision = await manager.requestPolicyDecision('read', 'intent_data');

      expect(decision).not.toBeNull();
      expect(decision?.allowed).toBe(true);
      expect(decision?.mode).toBe('RESTRICTED');
    });

    it('should return null when daemon is not configured', async () => {
      manager = new SecurityAppsManager({
        ...fullConfig,
        boundaryDaemon: { ...fullConfig.boundaryDaemon!, enabled: false },
      });
      await manager.initialize();

      const decision = await manager.requestPolicyDecision('action', 'resource');

      expect(decision).toBeNull();
    });
  });

  describe('logSecurityAction', () => {
    it('should log to both daemon and SIEM', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const context: SecurityActionContext = {
        actor: 'mediator-1',
        action: 'settlement_submit',
        resource: 'settlement-123',
        category: 'blockchain',
        severity: 3,
        settlementId: 'stl-456',
      };

      await manager.logSecurityAction(context, 'success');

      // Should call both daemon and SIEM
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should handle blocked outcome correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-2', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const context: SecurityActionContext = {
        actor: 'attacker',
        action: 'unauthorized_access',
        resource: 'admin_api',
        severity: 7,
      };

      await manager.logSecurityAction(context, 'blocked');

      // SIEM should receive 'failure' for 'blocked' outcome
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          outcome: 'failure', // Converted from 'blocked'
        })
      );
    });
  });

  describe('logBlockchainEvent', () => {
    it('should log blockchain events to SIEM', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'bc-evt-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      await manager.logBlockchainEvent(
        'intent_matched',
        'match',
        'success',
        {
          transactionHash: '0x123',
          intentHash: 'int-456',
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'intent_matched',
          category: 'blockchain',
          transactionHash: '0x123',
          intentHash: 'int-456',
        })
      );
    });
  });

  describe('logAuthEvent', () => {
    it('should log auth events to both systems', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'auth-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      await manager.logAuthEvent('login', 'user-123', 'success', {
        method: 'signature',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('logSettlementEvent', () => {
    it('should log settlement events to both systems', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'stl-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      await manager.logSettlementEvent('created', 'stl-789', 'success', {
        actor: 'mediator-1',
        intentHashes: ['int-1', 'int-2'],
        transactionHash: '0xabc',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('logPolicyViolation', () => {
    it('should log policy violations to both systems', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'pol-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      await manager.logPolicyViolation(
        'rate_limit',
        'spammer',
        'intent_submission',
        { attempts: 1000 }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('logThreatDetection', () => {
    it('should log threats to both systems', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'threat-1', received: true },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      await manager.logThreatDetection('sybil_attack', 8, {
        actor: 'malicious_node',
        source: 'peer_network',
        mitreTactic: 'initial_access',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCurrentMode', () => {
    it('should return current boundary mode', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { mode: 'TRUSTED', networkState: 'vpn_only' },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const mode = await manager.getCurrentMode();

      expect(mode).toBe('TRUSTED');
    });

    it('should return null when daemon is not configured', async () => {
      manager = new SecurityAppsManager({
        ...fullConfig,
        boundaryDaemon: { ...fullConfig.boundaryDaemon!, enabled: false },
      });
      await manager.initialize();

      const mode = await manager.getCurrentMode();

      expect(mode).toBeNull();
    });
  });

  describe('isInLockdown', () => {
    it('should return true in lockdown mode', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { mode: 'LOCKDOWN', networkState: 'blocked' },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const inLockdown = await manager.isInLockdown();

      expect(inLockdown).toBe(true);
    });

    it('should return false when daemon is not configured', async () => {
      manager = new SecurityAppsManager({
        ...fullConfig,
        boundaryDaemon: { ...fullConfig.boundaryDaemon!, enabled: false },
      });
      await manager.initialize();

      const inLockdown = await manager.isInLockdown();

      expect(inLockdown).toBe(false);
    });
  });

  describe('getActiveAlerts', () => {
    it('should fetch active alerts from SIEM', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({ status: 200, data: { mode: 'OPEN' } }) // Daemon health
        .mockResolvedValueOnce({ status: 200 }) // SIEM health
        .mockResolvedValue({
          data: {
            alerts: [
              { alertId: 'alert-1', severity: 8, status: 'new' },
              { alertId: 'alert-2', severity: 7, status: 'new' },
            ],
          },
        });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const alerts = await manager.getActiveAlerts(7);

      expect(alerts).toHaveLength(2);
    });

    it('should return empty array when SIEM is not configured', async () => {
      manager = new SecurityAppsManager({
        ...fullConfig,
        boundarySIEM: { ...fullConfig.boundarySIEM!, enabled: false },
      });
      await manager.initialize();

      const alerts = await manager.getActiveAlerts();

      expect(alerts).toEqual([]);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when both services are healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { mode: 'OPEN' },
      });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      const health = await manager.getHealth();

      expect(health.overall).toBe(true);
      expect(health.boundaryDaemon.enabled).toBe(true);
      expect(health.boundarySIEM.enabled).toBe(true);
    });

    it('should return unhealthy when daemon is down', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Daemon down')) // Daemon connect
        .mockResolvedValue({ status: 200 }); // SIEM connect and health checks

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      // Mock health check to fail
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Daemon still down'))
        .mockResolvedValue({ status: 200 });

      const health = await manager.getHealth();

      expect(health.overall).toBe(false);
      expect(health.boundaryDaemon.healthy).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should disconnect all clients', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { mode: 'OPEN' } });

      manager = new SecurityAppsManager(fullConfig);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);

      await manager.shutdown();

      expect(manager.isInitialized()).toBe(false);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getSecurityAppsManager', () => {
      const instance1 = getSecurityAppsManager();
      const instance2 = getSecurityAppsManager();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', async () => {
      const instance1 = getSecurityAppsManager();
      await resetSecurityAppsManager();
      const instance2 = getSecurityAppsManager();

      expect(instance1).not.toBe(instance2);
    });
  });
});
