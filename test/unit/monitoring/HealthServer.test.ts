import http, { Server } from 'http';
import { AddressInfo } from 'net';
import {
  HealthServer,
  HealthServerConfig,
  HealthStatusProvider,
} from '../../../src/monitoring/HealthServer';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface RequestOptions {
  method?: string;
  path?: string;
  headers?: http.OutgoingHttpHeaders;
  body?: string | Buffer;
}

/** Make a real HTTP request to the local health server (no keep-alive). */
function request(port: number, options: RequestOptions = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path ?? '/health/live',
        headers: { Connection: 'close', ...options.headers },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

function innerServer(healthServer: HealthServer): Server {
  return (healthServer as unknown as { server: Server }).server;
}

/**
 * Replace the underlying server's listen() so the configured host can be
 * observed without binding a non-loopback interface during tests.
 */
function stubListen(healthServer: HealthServer): jest.SpyInstance {
  const server = innerServer(healthServer);
  return jest.spyOn(server, 'listen').mockImplementation(((...args: unknown[]) => {
    const callback = args.find((arg) => typeof arg === 'function') as (() => void) | undefined;
    callback?.();
    return server;
  }) as never);
}

const runningProvider: HealthStatusProvider = {
  isRunning: true,
  cachedIntents: 42,
  activeSettlements: 3,
  reputation: 1.75,
};

describe('HealthServer', () => {
  const ENV_KEYS = ['HEALTH_SERVER_HOST', 'HEALTH_CORS_ORIGINS'] as const;
  const savedEnv: Record<string, string | undefined> = {};
  let started: HealthServer[] = [];

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    started = [];
  });

  afterEach(async () => {
    await Promise.all(started.map((s) => s.stop()));
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  /** Start a real server on an ephemeral port; it is stopped in afterEach. */
  async function startServer(
    config: Partial<HealthServerConfig> = {}
  ): Promise<{ healthServer: HealthServer; port: number; address: AddressInfo }> {
    const healthServer = new HealthServer({ port: 0, ...config });
    await healthServer.start();
    started.push(healthServer);
    const address = innerServer(healthServer).address() as AddressInfo;
    return { healthServer, port: address.port, address };
  }

  describe('binding', () => {
    it('binds to 127.0.0.1 by default', async () => {
      const { address } = await startServer();

      expect(address.address).toBe('127.0.0.1');
      expect(mockedLogger.info).toHaveBeenCalledWith(
        'Health server started',
        expect.objectContaining({
          host: '127.0.0.1',
          endpoints: ['/health', '/health/live', '/health/ready'],
        })
      );
    });

    it('uses the host from config when provided', async () => {
      const healthServer = new HealthServer({ port: 0, host: '0.0.0.0' });
      const listenSpy = stubListen(healthServer);

      await healthServer.start();

      expect(listenSpy).toHaveBeenCalledWith(0, '0.0.0.0', expect.any(Function));
    });

    it('uses HEALTH_SERVER_HOST when no host is configured', async () => {
      process.env.HEALTH_SERVER_HOST = '0.0.0.0';
      const healthServer = new HealthServer({ port: 0 });
      const listenSpy = stubListen(healthServer);

      await healthServer.start();

      expect(listenSpy).toHaveBeenCalledWith(0, '0.0.0.0', expect.any(Function));
    });

    it('stays on 127.0.0.1 when host is passed explicitly as undefined', async () => {
      const { address } = await startServer({ host: undefined });

      expect(address.address).toBe('127.0.0.1');
    });

    it('prefers the configured host over HEALTH_SERVER_HOST', async () => {
      process.env.HEALTH_SERVER_HOST = '0.0.0.0';

      const { address } = await startServer({ host: '127.0.0.1' });

      expect(address.address).toBe('127.0.0.1');
    });

    it('rejects start() and logs when the port is already in use', async () => {
      const { port } = await startServer();
      const conflicting = new HealthServer({ port, host: '127.0.0.1' });

      await expect(conflicting.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Health server error',
        expect.objectContaining({ error: expect.stringContaining('EADDRINUSE') })
      );
    });

    it('stops accepting connections after stop()', async () => {
      const healthServer = new HealthServer({ port: 0 });
      await healthServer.start();
      const { port } = innerServer(healthServer).address() as AddressInfo;

      await healthServer.stop();

      expect(mockedLogger.info).toHaveBeenCalledWith('Health server stopped');
      await expect(request(port)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    });
  });

  describe('CORS', () => {
    it('sends no Access-Control-Allow-Origin header when no allowlist is configured', async () => {
      const { port } = await startServer();

      const res = await request(port, { headers: { Origin: 'https://evil.example' } });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['vary']).toBeUndefined();
    });

    it('echoes an allowed origin from config with Vary: Origin', async () => {
      const { port } = await startServer({ corsOrigins: ['https://dashboard.example'] });

      const res = await request(port, { headers: { Origin: 'https://dashboard.example' } });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.example');
      expect(res.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
      expect(res.headers['vary']).toBe('Origin');
    });

    it('sends no CORS headers for an origin outside the allowlist', async () => {
      const { port } = await startServer({ corsOrigins: ['https://dashboard.example'] });

      const res = await request(port, { headers: { Origin: 'https://evil.example' } });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-methods']).toBeUndefined();
    });

    it('sends no CORS headers when the request has no Origin', async () => {
      const { port } = await startServer({ corsOrigins: ['https://dashboard.example'] });

      const res = await request(port);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never treats an allowlist entry as a wildcard', async () => {
      const { port } = await startServer({ corsOrigins: ['https://dashboard.example'] });

      const res = await request(port, {
        headers: { Origin: 'https://dashboard.example.evil.example' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('reads a comma-separated, whitespace-tolerant allowlist from HEALTH_CORS_ORIGINS', async () => {
      process.env.HEALTH_CORS_ORIGINS = 'https://a.example, https://b.example';
      const { port } = await startServer();

      const a = await request(port, { headers: { Origin: 'https://a.example' } });
      const b = await request(port, { headers: { Origin: 'https://b.example' } });
      const other = await request(port, { headers: { Origin: 'https://c.example' } });

      expect(a.headers['access-control-allow-origin']).toBe('https://a.example');
      expect(b.headers['access-control-allow-origin']).toBe('https://b.example');
      expect(b.headers['vary']).toBe('Origin');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('prefers the configured allowlist over HEALTH_CORS_ORIGINS', async () => {
      process.env.HEALTH_CORS_ORIGINS = 'https://env.example';
      const { port } = await startServer({ corsOrigins: ['https://config.example'] });

      const fromEnv = await request(port, { headers: { Origin: 'https://env.example' } });
      const fromConfig = await request(port, { headers: { Origin: 'https://config.example' } });

      expect(fromEnv.headers['access-control-allow-origin']).toBeUndefined();
      expect(fromConfig.headers['access-control-allow-origin']).toBe('https://config.example');
    });
  });

  describe('request handling', () => {
    it('answers OPTIONS preflight with 204 and an empty body', async () => {
      const { port } = await startServer({ corsOrigins: ['https://dashboard.example'] });

      const res = await request(port, {
        method: 'OPTIONS',
        path: '/health',
        headers: { Origin: 'https://dashboard.example' },
      });

      expect(res.status).toBe(204);
      expect(res.body).toBe('');
      expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.example');
    });

    it('answers OPTIONS with 204 but no CORS grant when no allowlist is configured', async () => {
      const { port } = await startServer();

      const res = await request(port, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      });

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s with 405', async (method) => {
      const { port } = await startServer();

      const res = await request(port, { method, path: '/health' });

      expect(res.status).toBe(405);
      expect(res.headers['content-type']).toBe('application/json');
      expect(JSON.parse(res.body)).toEqual({ error: 'Method not allowed' });
    });

    it('rejects a request whose Content-Length exceeds 1024 bytes with 413', async () => {
      const { port } = await startServer();

      const res = await request(port, {
        path: '/health/live',
        headers: { 'Content-Length': '2048' },
        body: Buffer.alloc(2048, 'a'),
      });

      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ error: 'Request body too large' });
    });

    it('accepts a request whose Content-Length is exactly 1024 bytes', async () => {
      const { port } = await startServer();

      const res = await request(port, {
        path: '/health/live',
        headers: { 'Content-Length': '1024' },
        body: Buffer.alloc(1024, 'a'),
      });

      expect(res.status).toBe(200);
    });

    it.each(['/', '/healthz', '/health/', '/health/live/extra', '/metrics'])(
      'returns 404 for unknown path %s',
      async (path) => {
        const { port } = await startServer();

        const res = await request(port, { path });

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toBe('application/json');
        expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
      }
    );
  });

  describe('GET /health', () => {
    it('reports unhealthy with zeroed node stats when no status provider is set', async () => {
      const { port } = await startServer();

      const res = await request(port, { path: '/health' });
      const body = JSON.parse(res.body);

      expect(res.status).toBe(503);
      expect(res.headers['content-type']).toBe('application/json');
      expect(body).toMatchObject({
        status: 'unhealthy',
        node: { isRunning: false, cachedIntents: 0, activeSettlements: 0, reputation: 0 },
      });
      expect(typeof body.timestamp).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reports healthy with the provider stats when the node is running', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider(runningProvider);

      const res = await request(port, { path: '/health' });

      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        status: 'healthy',
        node: { isRunning: true, cachedIntents: 42, activeSettlements: 3, reputation: 1.75 },
      });
    });

    it('reports unhealthy (503) but still includes stats when the node is stopped', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({ ...runningProvider, isRunning: false });

      const res = await request(port, { path: '/health' });

      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toMatchObject({
        status: 'unhealthy',
        node: { isRunning: false, cachedIntents: 42, activeSettlements: 3, reputation: 1.75 },
      });
    });

    it('reflects provider changes on subsequent requests', async () => {
      const { healthServer, port } = await startServer();
      const provider: HealthStatusProvider = { ...runningProvider };
      healthServer.setStatusProvider(provider);

      const first = await request(port, { path: '/health' });
      provider.isRunning = false;
      const second = await request(port, { path: '/health' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(503);
    });

    it('reports uptime measured from server construction', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const { port } = await startServer();
      nowSpy.mockReturnValue(1_005_000);

      const body = JSON.parse((await request(port, { path: '/health' })).body);

      expect(body.uptime).toBe(5_000);
      expect(body.timestamp).toBe(1_005_000);
    });

    it('returns 500 and logs when the status provider throws', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({
        get isRunning(): boolean {
          throw new Error('provider exploded');
        },
        cachedIntents: 0,
        activeSettlements: 0,
        reputation: 0,
      });

      const res = await request(port, { path: '/health' });

      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
      expect(mockedLogger.error).toHaveBeenCalledWith('Health endpoint error', {
        error: 'provider exploded',
        url: '/health',
      });
    });

    it('does not leak non-Error throw values to the client', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({
        get isRunning(): boolean {
          throw 'secret internal detail';
        },
        cachedIntents: 0,
        activeSettlements: 0,
        reputation: 0,
      });

      const res = await request(port, { path: '/health' });

      expect(res.status).toBe(500);
      expect(res.body).not.toContain('secret internal detail');
      expect(mockedLogger.error).toHaveBeenCalledWith('Health endpoint error', {
        error: 'Unknown error',
        url: '/health',
      });
    });
  });

  describe('GET /health/live', () => {
    it('returns 200 alive even when the node is not running', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({ ...runningProvider, isRunning: false });

      const res = await request(port, { path: '/health/live' });
      const body = JSON.parse(res.body);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json');
      expect(body.status).toBe('alive');
      expect(typeof body.timestamp).toBe('number');
    });
  });

  describe('GET /health/ready', () => {
    it('returns 503 not_ready when no status provider is set', async () => {
      const { port } = await startServer();

      const res = await request(port, { path: '/health/ready' });

      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toMatchObject({ status: 'not_ready' });
    });

    it('returns 200 ready when the node is running', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider(runningProvider);

      const res = await request(port, { path: '/health/ready' });
      const body = JSON.parse(res.body);

      expect(res.status).toBe(200);
      expect(body.status).toBe('ready');
      expect(typeof body.timestamp).toBe('number');
    });

    it('returns 503 not_ready when the node is stopped', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({ ...runningProvider, isRunning: false });

      const res = await request(port, { path: '/health/ready' });

      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toMatchObject({ status: 'not_ready' });
    });

    it('returns 500 when the status provider throws', async () => {
      const { healthServer, port } = await startServer();
      healthServer.setStatusProvider({
        get isRunning(): boolean {
          throw new Error('not yet initialised');
        },
        cachedIntents: 0,
        activeSettlements: 0,
        reputation: 0,
      });

      const res = await request(port, { path: '/health/ready' });

      expect(res.status).toBe(500);
      expect(mockedLogger.error).toHaveBeenCalledWith('Health endpoint error', {
        error: 'not yet initialised',
        url: '/health/ready',
      });
    });
  });
});
