/**
 * Unit tests for BoundaryDaemonClient
 *
 * Tests the integration with Boundary Daemon for policy decisions,
 * audit logging, and environment monitoring.
 *
 * @see https://github.com/kase1111-hash/boundary-daemon-
 */

import axios from 'axios';
import {
  BoundaryDaemonClient,
  BoundaryDaemonConfig,
  BoundaryMode,
  PolicyDecision,
  AuditEvent,
  EnvironmentStatus,
} from '../../../src/security/BoundaryDaemonClient';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BoundaryDaemonClient', () => {
  let client: BoundaryDaemonClient;
  let mockAxiosInstance: any;

  const defaultConfig: Partial<BoundaryDaemonConfig> = {
    baseUrl: 'http://test-daemon:9000',
    apiToken: 'test-daemon-token',
    timeout: 3000,
    failOpen: false,
    retryAttempts: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();

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

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('constructor', () => {
    it('should create client with default configuration', () => {
      client = new BoundaryDaemonClient();
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:9000',
          timeout: 5000,
        })
      );
    });

    it('should create client with custom configuration', () => {
      client = new BoundaryDaemonClient(defaultConfig);
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://test-daemon:9000',
          timeout: 3000,
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-daemon-token',
          }),
        })
      );
    });

    it('should configure Unix socket path when provided', () => {
      client = new BoundaryDaemonClient({
        ...defaultConfig,
        socketPath: '/var/run/boundary/daemon.sock',
      });
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          socketPath: '/var/run/boundary/daemon.sock',
        })
      );
    });
  });

  describe('connect', () => {
    it('should successfully connect when health endpoint returns 200', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { mode: 'RESTRICTED' },
      });

      const result = await client.connect();

      expect(result).toBe(true);
      expect(client.isConnected()).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should fail to connect when health endpoint returns error', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getEnvironmentStatus', () => {
    it('should fetch environment status successfully', async () => {
      client = new BoundaryDaemonClient(defaultConfig);

      const mockStatus: EnvironmentStatus = {
        mode: 'RESTRICTED',
        networkState: 'online',
        memoryClasses: [0, 1, 2],
        tripwireStatus: 'normal',
        lastCheck: Date.now(),
        processes: 45,
        usbDevices: 2,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockStatus });

      const status = await client.getEnvironmentStatus();

      expect(status).not.toBeNull();
      expect(status?.mode).toBe('RESTRICTED');
      expect(status?.networkState).toBe('online');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/status');
    });

    it('should handle status fetch errors', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const status = await client.getEnvironmentStatus();

      expect(status).toBeNull();
    });
  });

  describe('requestPolicyDecision', () => {
    it('should request policy decision and return result', async () => {
      client = new BoundaryDaemonClient(defaultConfig);

      const mockDecision: PolicyDecision = {
        allowed: true,
        mode: 'RESTRICTED',
        reason: 'Action permitted in RESTRICTED mode',
        timestamp: Date.now(),
        decisionId: 'dec-123',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockDecision });

      const decision = await client.requestPolicyDecision(
        'websocket_connect',
        'websocket_server',
        { ip: '192.168.1.1' }
      );

      expect(decision.allowed).toBe(true);
      expect(decision.mode).toBe('RESTRICTED');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/policy/decide',
        expect.objectContaining({
          action: 'websocket_connect',
          resource: 'websocket_server',
          context: { ip: '192.168.1.1' },
        })
      );
    });

    it('should return deny decision when policy rejects', async () => {
      client = new BoundaryDaemonClient(defaultConfig);

      const mockDecision: PolicyDecision = {
        allowed: false,
        mode: 'LOCKDOWN',
        reason: 'System in lockdown mode',
        timestamp: Date.now(),
        decisionId: 'dec-456',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockDecision });

      const decision = await client.requestPolicyDecision(
        'network_access',
        'external_api'
      );

      expect(decision.allowed).toBe(false);
      expect(decision.mode).toBe('LOCKDOWN');
    });

    it('should return fallback decision when daemon is unavailable (fail-closed)', async () => {
      client = new BoundaryDaemonClient({
        ...defaultConfig,
        failOpen: false,
      });
      mockAxiosInstance.post.mockRejectedValue(new Error('Connection refused'));

      const decision = await client.requestPolicyDecision('test_action', 'test_resource');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('unavailable');
    });

    it('should return fallback decision when daemon is unavailable (fail-open)', async () => {
      client = new BoundaryDaemonClient({
        ...defaultConfig,
        failOpen: true,
      });
      mockAxiosInstance.post.mockRejectedValue(new Error('Connection refused'));

      const decision = await client.requestPolicyDecision('test_action', 'test_resource');

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('fail-open');
    });
  });

  describe('isActionAllowed', () => {
    it('should return true when action is allowed', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          allowed: true,
          mode: 'OPEN',
          timestamp: Date.now(),
          decisionId: 'dec-789',
        },
      });

      const allowed = await client.isActionAllowed('read_memory', 'intent_cache');

      expect(allowed).toBe(true);
    });

    it('should return false when action is denied', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          allowed: false,
          mode: 'AIRGAP',
          reason: 'Network access denied in AIRGAP mode',
          timestamp: Date.now(),
          decisionId: 'dec-101',
        },
      });

      const allowed = await client.isActionAllowed('external_api', 'chain_endpoint');

      expect(allowed).toBe(false);
    });
  });

  describe('logAuditEvent', () => {
    it('should log audit event successfully', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          eventId: 'aud-123',
          signature: 'sig-abc',
          timestamp: Date.now(),
        },
      });

      const event: AuditEvent = {
        eventType: 'security_action',
        action: 'settlement_proposed',
        actor: 'mediator-1',
        resource: 'settlement-789',
        outcome: 'success',
        details: { intentCount: 2 },
      };

      const result = await client.logAuditEvent(event);

      expect(result).not.toBeNull();
      expect(result?.eventId).toBe('aud-123');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/audit/log',
        expect.objectContaining({
          eventType: 'security_action',
          action: 'settlement_proposed',
          actor: 'mediator-1',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle audit logging errors', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockRejectedValue(new Error('Write failed'));

      const event: AuditEvent = {
        eventType: 'test',
        action: 'test',
        actor: 'test',
        resource: 'test',
        outcome: 'success',
      };

      const result = await client.logAuditEvent(event);

      expect(result).toBeNull();
    });
  });

  describe('logSecurityAction', () => {
    it('should log security action with proper structure', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'sec-123', signature: 'sig-xyz', timestamp: Date.now() },
      });

      await client.logSecurityAction(
        'authenticate',
        'user-456',
        'websocket_server',
        'success',
        { method: 'signature_verify' }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/audit/log',
        expect.objectContaining({
          eventType: 'security_action',
          action: 'authenticate',
          actor: 'user-456',
          resource: 'websocket_server',
          outcome: 'success',
          details: { method: 'signature_verify' },
        })
      );
    });
  });

  describe('logAccessDecision', () => {
    it('should log allowed access decision', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'acc-1', signature: 'sig', timestamp: Date.now() },
      });

      await client.logAccessDecision('mediator-1', 'chain_endpoint', true, 'Authorized');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/audit/log',
        expect.objectContaining({
          eventType: 'access_control',
          action: 'access_request',
          outcome: 'success',
        })
      );
    });

    it('should log blocked access decision', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'acc-2', signature: 'sig', timestamp: Date.now() },
      });

      await client.logAccessDecision('attacker', 'admin_api', false, 'Unauthorized');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/audit/log',
        expect.objectContaining({
          outcome: 'blocked',
          details: { reason: 'Unauthorized' },
        })
      );
    });
  });

  describe('getCurrentMode', () => {
    it('should return current boundary mode', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          mode: 'TRUSTED',
          networkState: 'vpn_only',
          memoryClasses: [0, 1],
          tripwireStatus: 'normal',
          lastCheck: Date.now(),
          processes: 30,
          usbDevices: 0,
        },
      });

      const mode = await client.getCurrentMode();

      expect(mode).toBe('TRUSTED');
    });

    it('should return cached mode when daemon is unavailable', async () => {
      client = new BoundaryDaemonClient(defaultConfig);

      // First successful call to set cache
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { mode: 'RESTRICTED' },
      });
      await client.getEnvironmentStatus();

      // Second call fails
      mockAxiosInstance.get.mockRejectedValue(new Error('Unavailable'));
      const mode = await client.getCurrentMode();

      expect(mode).toBe('RESTRICTED'); // Returns cached value
    });
  });

  describe('isNetworkAllowed', () => {
    const networkAllowedModes: BoundaryMode[] = ['OPEN', 'RESTRICTED', 'TRUSTED'];
    const networkDeniedModes: BoundaryMode[] = ['AIRGAP', 'COLDROOM', 'LOCKDOWN'];

    it.each(networkAllowedModes)('should return true for %s mode', async (mode) => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: { mode, networkState: 'online' },
      });

      const allowed = await client.isNetworkAllowed();

      expect(allowed).toBe(true);
    });

    it.each(networkDeniedModes)('should return false for %s mode', async (mode) => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: { mode, networkState: 'offline' },
      });

      const allowed = await client.isNetworkAllowed();

      expect(allowed).toBe(false);
    });
  });

  describe('isInLockdown', () => {
    it('should return true when in LOCKDOWN mode', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: { mode: 'LOCKDOWN', networkState: 'blocked' },
      });

      const inLockdown = await client.isInLockdown();

      expect(inLockdown).toBe(true);
    });

    it('should return false when not in LOCKDOWN mode', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: { mode: 'RESTRICTED', networkState: 'online' },
      });

      const inLockdown = await client.isInLockdown();

      expect(inLockdown).toBe(false);
    });
  });

  describe('queryAuditLogs', () => {
    it('should query audit logs with filters', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          events: [
            { eventId: 'e1', eventType: 'security_action', action: 'login' },
            { eventId: 'e2', eventType: 'security_action', action: 'logout' },
          ],
        },
      });

      const logs = await client.queryAuditLogs({
        eventType: 'security_action',
        actor: 'mediator-1',
        limit: 100,
      });

      expect(logs).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/audit/query', {
        params: expect.objectContaining({
          eventType: 'security_action',
          actor: 'mediator-1',
          limit: 100,
        }),
      });
    });

    it('should handle query errors', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Query failed'));

      const logs = await client.queryAuditLogs();

      expect(logs).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when daemon is reachable', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { mode: 'OPEN' },
      });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details.connected).toBe(true);
      expect(health.details.mode).toBe('OPEN');
    });

    it('should return unhealthy status when daemon is unreachable', async () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Timeout'));

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.details.connected).toBe(false);
      expect(health.details.failOpen).toBe(false);
    });

    it('should include failOpen status in health check', async () => {
      client = new BoundaryDaemonClient({ ...defaultConfig, failOpen: true });
      mockAxiosInstance.get.mockRejectedValue(new Error('Timeout'));

      const health = await client.healthCheck();

      expect(health.details.failOpen).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should mark client as disconnected', () => {
      client = new BoundaryDaemonClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('retry logic', () => {
    it('should retry failed requests', async () => {
      client = new BoundaryDaemonClient({
        ...defaultConfig,
        retryAttempts: 3,
      });

      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Temp failure'))
        .mockResolvedValue({
          data: {
            allowed: true,
            mode: 'OPEN',
            timestamp: Date.now(),
            decisionId: 'retry-dec',
          },
        });

      const decision = await client.requestPolicyDecision('test', 'resource');

      expect(decision.allowed).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });
});
