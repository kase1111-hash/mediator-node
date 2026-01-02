/**
 * Unit tests for BoundarySIEMClient
 *
 * Tests the integration with Boundary SIEM for security event management,
 * batch event processing, and alert handling.
 *
 * @see https://github.com/kase1111-hash/Boundary-SIEM
 */

import axios from 'axios';
import {
  BoundarySIEMClient,
  BoundarySIEMConfig,
  SecurityEvent,
  SIEMSeverity,
  EventCategory,
} from '../../../src/security/BoundarySIEMClient';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BoundarySIEMClient', () => {
  let client: BoundarySIEMClient;
  let mockAxiosInstance: any;

  const defaultConfig: Partial<BoundarySIEMConfig> = {
    baseUrl: 'http://test-siem:8080',
    apiToken: 'test-token',
    timeout: 5000,
    batchEnabled: false, // Disable batching for most tests
    sourceId: 'test-mediator',
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
      client = new BoundarySIEMClient();
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:8080',
          timeout: 10000,
        })
      );
    });

    it('should create client with custom configuration', () => {
      client = new BoundarySIEMClient(defaultConfig);
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://test-siem:8080',
          timeout: 5000,
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('connect', () => {
    it('should successfully connect when health endpoint returns 200', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const result = await client.connect();

      expect(result).toBe(true);
      expect(client.isConnected()).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/health');
    });

    it('should fail to connect when health endpoint returns non-200', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({ status: 503 });

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });

    it('should handle connection errors gracefully', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await client.connect();

      expect(result).toBe(false);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('submitEvent', () => {
    it('should submit a single event successfully', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-123', received: true, timestamp: Date.now() },
      });

      const event: SecurityEvent = {
        name: 'test_event',
        category: 'blockchain',
        severity: 5,
        source: '', // Empty source will be replaced with sourceId
        action: 'test_action',
        outcome: 'success',
      };

      const result = await client.submitEvent(event);

      expect(result).not.toBeNull();
      expect(result?.eventId).toBe('evt-123');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'test_event',
          category: 'blockchain',
          severity: 5,
          source: 'test-mediator', // Uses sourceId from config when source is empty
        })
      );
    });

    it('should enrich event with timestamp and source', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-123', received: true },
      });

      const event: SecurityEvent = {
        name: 'test_event',
        category: 'authentication',
        severity: 3,
        source: '', // Empty source should be replaced
        action: 'login',
        outcome: 'success',
      };

      await client.submitEvent(event);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          source: 'test-mediator',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle submission errors', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      const event: SecurityEvent = {
        name: 'test_event',
        category: 'system',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      const result = await client.submitEvent(event);

      expect(result).toBeNull();
    });
  });

  describe('batch event submission', () => {
    it('should queue events when batching is enabled', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        batchEnabled: true,
        batchSize: 5,
        batchFlushInterval: 60000, // Long interval to prevent auto-flush
      });

      const event: SecurityEvent = {
        name: 'batch_test',
        category: 'blockchain',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      const result = await client.submitEvent(event);

      expect(result).not.toBeNull();
      expect(result?.eventId).toMatch(/^queued-/);
      // Should not call API immediately when batching
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    });

    it('should auto-flush when batch size is reached', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        batchEnabled: true,
        batchSize: 2,
        batchFlushInterval: 60000,
      });

      mockAxiosInstance.post.mockResolvedValue({
        data: { results: [], correlationId: 'corr-123' },
      });

      const event: SecurityEvent = {
        name: 'batch_test',
        category: 'blockchain',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      await client.submitEvent(event);
      await client.submitEvent(event);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events/batch',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({ name: 'batch_test' }),
          ]),
        })
      );
    });

    it('should flush events on demand', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        batchEnabled: true,
        batchSize: 100,
        batchFlushInterval: 60000,
      });

      mockAxiosInstance.post.mockResolvedValue({
        data: { results: [], correlationId: 'corr-123' },
      });

      const event: SecurityEvent = {
        name: 'flush_test',
        category: 'blockchain',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      await client.submitEvent(event);
      await client.flushEvents();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events/batch',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({ name: 'flush_test' }),
          ]),
        })
      );
    });
  });

  describe('logBlockchainEvent', () => {
    it('should log blockchain events with correct category', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-bc-1', received: true },
      });

      await client.logBlockchainEvent(
        'settlement_created',
        'create',
        'success',
        {
          transactionHash: '0x123abc',
          settlementId: 'stl-456',
          actor: 'mediator-1',
        }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'settlement_created',
          category: 'blockchain',
          action: 'create',
          outcome: 'success',
          transactionHash: '0x123abc',
          settlementId: 'stl-456',
          actor: 'mediator-1',
        })
      );
    });
  });

  describe('logAuthEvent', () => {
    it('should log successful authentication events', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-auth-1', received: true },
      });

      await client.logAuthEvent('login', 'user123', 'success', {
        method: 'signature',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'auth_login',
          category: 'authentication',
          severity: 3, // Success = low severity
          outcome: 'success',
          actor: 'user123',
        })
      );
    });

    it('should log failed authentication with higher severity', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-auth-2', received: true },
      });

      await client.logAuthEvent('login', 'attacker', 'failure', {
        reason: 'invalid_signature',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          severity: 6, // Failure = higher severity
          outcome: 'failure',
          mitreTactic: 'credential_access',
        })
      );
    });
  });

  describe('logPolicyViolation', () => {
    it('should log policy violations with high severity', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-pol-1', received: true },
      });

      await client.logPolicyViolation(
        'rate_limit',
        'spammer123',
        'intent_submission',
        { attempts: 100 }
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'policy_violation',
          category: 'policy_violation',
          severity: 7,
          action: 'violated_rate_limit',
          outcome: 'failure',
          mitreTactic: 'defense_evasion',
        })
      );
    });
  });

  describe('logThreatDetection', () => {
    it('should log threat detection with MITRE ATT&CK context', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-threat-1', received: true },
      });

      await client.logThreatDetection('sybil_attack_detected', 8, {
        actor: 'malicious_node',
        source: 'peer_network',
        mitreTactic: 'initial_access',
        mitreTechnique: 'T1190',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'sybil_attack_detected',
          category: 'threat_detection',
          severity: 8,
          mitreTactic: 'initial_access',
          mitreTechnique: 'T1190',
        })
      );
    });
  });

  describe('logSettlementEvent', () => {
    it('should log settlement lifecycle events', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({
        data: { eventId: 'evt-stl-1', received: true },
      });

      await client.logSettlementEvent('proposed', 'stl-789', 'success', {
        actor: 'mediator-1',
        intentHashes: ['int-1', 'int-2'],
        transactionHash: '0xabc',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events',
        expect.objectContaining({
          name: 'settlement_proposed',
          category: 'blockchain',
          settlementId: 'stl-789',
          transactionHash: '0xabc',
          details: expect.objectContaining({
            intentHashes: ['int-1', 'int-2'],
          }),
        })
      );
    });
  });

  describe('getAlerts', () => {
    it('should fetch alerts from SIEM', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          alerts: [
            {
              alertId: 'alert-1',
              ruleId: 'rule-1',
              ruleName: 'Suspicious Activity',
              severity: 7,
              category: 'threat_detection',
              status: 'new',
            },
          ],
        },
      });

      const alerts = await client.getAlerts({ severity: 7 });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertId).toBe('alert-1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/alerts', {
        params: { severity: 7 },
      });
    });

    it('should handle alert fetch errors', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Fetch failed'));

      const alerts = await client.getAlerts();

      expect(alerts).toEqual([]);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert successfully', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockResolvedValue({ status: 200 });

      const result = await client.acknowledgeAlert('alert-123');

      expect(result).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/alerts/alert-123/acknowledge'
      );
    });

    it('should handle acknowledge errors', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.post.mockRejectedValue(new Error('Not found'));

      const result = await client.acknowledgeAlert('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('queryEvents', () => {
    it('should query events with filters', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          events: [
            { name: 'event-1', category: 'blockchain' },
            { name: 'event-2', category: 'blockchain' },
          ],
        },
      });

      const events = await client.queryEvents({
        category: 'blockchain',
        startTime: Date.now() - 3600000,
        limit: 50,
      });

      expect(events).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/events', {
        params: expect.objectContaining({
          category: 'blockchain',
          limit: 50,
        }),
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when SIEM is reachable', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details.connected).toBe(true);
    });

    it('should return unhealthy status when SIEM is unreachable', async () => {
      client = new BoundarySIEMClient(defaultConfig);
      mockAxiosInstance.get.mockRejectedValue(new Error('Timeout'));

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.details.connected).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should flush pending events on disconnect', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        batchEnabled: true,
        batchSize: 100,
        batchFlushInterval: 60000,
      });

      mockAxiosInstance.post.mockResolvedValue({
        data: { results: [] },
      });

      const event: SecurityEvent = {
        name: 'disconnect_test',
        category: 'system',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      await client.submitEvent(event);
      await client.disconnect();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/events/batch',
        expect.any(Object)
      );
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('retry logic', () => {
    it('should retry failed requests with exponential backoff', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        retryAttempts: 3,
      });

      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Still failing'))
        .mockResolvedValue({ data: { eventId: 'evt-retry', received: true } });

      const event: SecurityEvent = {
        name: 'retry_test',
        category: 'system',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      const result = await client.submitEvent(event);

      expect(result).not.toBeNull();
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retry attempts', async () => {
      client = new BoundarySIEMClient({
        ...defaultConfig,
        retryAttempts: 2,
      });

      mockAxiosInstance.post.mockRejectedValue(new Error('Persistent failure'));

      const event: SecurityEvent = {
        name: 'fail_test',
        category: 'system',
        severity: 3,
        source: 'test',
        action: 'test',
        outcome: 'success',
      };

      const result = await client.submitEvent(event);

      expect(result).toBeNull();
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });
});
