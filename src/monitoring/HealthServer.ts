/**
 * HTTP Health Server
 *
 * Exposes health check endpoints for monitoring and orchestration.
 * Designed for use with Kubernetes, Docker health checks, and load balancers.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { HealthMonitor } from './HealthMonitor';
import { logger } from '../utils/logger';

export interface HealthServerConfig {
  port: number;
  host?: string;
}

/**
 * HTTP server that exposes health check endpoints
 *
 * Endpoints:
 * - GET /health - Full health report (JSON)
 * - GET /health/live - Liveness probe (returns 200 if process is running)
 * - GET /health/ready - Readiness probe (returns 200 if healthy, 503 if degraded/unhealthy)
 */
export class HealthServer {
  private server: Server;
  private healthMonitor: HealthMonitor;
  private config: Required<HealthServerConfig>;

  constructor(healthMonitor: HealthMonitor, config: HealthServerConfig) {
    this.healthMonitor = healthMonitor;
    this.config = {
      host: config.host || '0.0.0.0',
      ...config,
    };

    this.server = createServer((req, res) => this.handleRequest(req, res));
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
          await this.handleHealthCheck(res);
          break;
        case '/health/live':
          this.handleLivenessProbe(res);
          break;
        case '/health/ready':
          await this.handleReadinessProbe(res);
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
   * Returns complete health report
   */
  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const report = await this.healthMonitor.performHealthCheck();

    const statusCode = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503;

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
   * Returns 200 if healthy/degraded, 503 if unhealthy
   */
  private async handleReadinessProbe(res: ServerResponse): Promise<void> {
    const report = await this.healthMonitor.performHealthCheck();

    const isReady = report.status === 'healthy' || report.status === 'degraded';
    const statusCode = isReady ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: isReady ? 'ready' : 'not_ready',
        health: report.status,
        timestamp: Date.now(),
      })
    );
  }
}
