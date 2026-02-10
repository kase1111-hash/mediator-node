/**
 * HTTP Health Server
 *
 * Exposes health check endpoints for monitoring and orchestration.
 * Designed for use with Kubernetes, Docker health checks, and load balancers.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { logger } from '../utils/logger';

export interface HealthServerConfig {
  port: number;
  host?: string;
}

export interface HealthStatusProvider {
  isRunning: boolean;
  cachedIntents: number;
  activeSettlements: number;
  reputation: number;
}

/**
 * HTTP server that exposes health check endpoints
 *
 * Endpoints:
 * - GET /health - Full health report (JSON)
 * - GET /health/live - Liveness probe (returns 200 if process is running)
 * - GET /health/ready - Readiness probe (returns 200 if running, 503 if not)
 */
export class HealthServer {
  private server: Server;
  private config: Required<HealthServerConfig>;
  private statusProvider: HealthStatusProvider | null = null;
  private startTime: number = Date.now();

  constructor(config: HealthServerConfig) {
    this.config = {
      host: config.host || '0.0.0.0',
      ...config,
    };

    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  /**
   * Set the status provider for health checks
   */
  public setStatusProvider(provider: HealthStatusProvider): void {
    this.statusProvider = provider;
  }

  /**
   * Start the health server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info('Health server started', {
          port: this.config.port,
          host: this.config.host,
          endpoints: ['/health', '/health/live', '/health/ready'],
        });
        resolve();
      });

      this.server.on('error', (err) => {
        logger.error('Health server error', { error: err.message });
        reject(err);
      });
    });
  }

  /**
   * Stop the health server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Health server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      switch (url) {
        case '/health':
          this.handleHealthCheck(res);
          break;
        case '/health/live':
          this.handleLivenessProbe(res);
          break;
        case '/health/ready':
          this.handleReadinessProbe(res);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      logger.error('Health endpoint error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Full health check endpoint
   * Returns health report with basic node status
   */
  private handleHealthCheck(res: ServerResponse): void {
    const isRunning = this.statusProvider?.isRunning ?? false;
    const status = isRunning ? 'healthy' : 'unhealthy';
    const statusCode = isRunning ? 200 : 503;

    const report = {
      status,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      node: {
        isRunning,
        cachedIntents: this.statusProvider?.cachedIntents ?? 0,
        activeSettlements: this.statusProvider?.activeSettlements ?? 0,
        reputation: this.statusProvider?.reputation ?? 0,
      },
    };

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report, null, 2));
  }

  /**
   * Liveness probe endpoint
   * Returns 200 if the process is running
   */
  private handleLivenessProbe(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'alive',
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Readiness probe endpoint
   * Returns 200 if node is running, 503 if not
   */
  private handleReadinessProbe(res: ServerResponse): void {
    const isReady = this.statusProvider?.isRunning ?? false;
    const statusCode = isReady ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: isReady ? 'ready' : 'not_ready',
        timestamp: Date.now(),
      })
    );
  }
}
