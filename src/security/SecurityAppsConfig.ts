/**
 * Security Apps Configuration
 *
 * Configuration types and defaults for Boundary Daemon and Boundary SIEM
 * integrations. These security applications provide policy enforcement,
 * audit logging, and security event management.
 */

import { BoundaryDaemonConfig } from './BoundaryDaemonClient';
import { BoundarySIEMConfig } from './BoundarySIEMClient';

/**
 * Combined security apps configuration
 */
export interface SecurityAppsConfig {
  /** Enable security apps integration */
  enabled: boolean;
  /** Boundary Daemon configuration */
  boundaryDaemon: BoundaryDaemonConfig & {
    enabled: boolean;
  };
  /** Boundary SIEM configuration */
  boundarySIEM: BoundarySIEMConfig & {
    enabled: boolean;
  };
}

/**
 * Load security apps configuration from environment variables
 */
export function loadSecurityAppsConfig(): SecurityAppsConfig {
  const daemonEnabled = process.env.BOUNDARY_DAEMON_ENABLED === 'true';
  const siemEnabled = process.env.BOUNDARY_SIEM_ENABLED === 'true';

  return {
    enabled: daemonEnabled || siemEnabled,
    boundaryDaemon: {
      enabled: daemonEnabled,
      baseUrl: process.env.BOUNDARY_DAEMON_URL || 'http://localhost:9000',
      socketPath: process.env.BOUNDARY_DAEMON_SOCKET,
      apiToken: process.env.BOUNDARY_DAEMON_TOKEN,
      timeout: parseInt(process.env.BOUNDARY_DAEMON_TIMEOUT || '5000', 10),
      failOpen: process.env.BOUNDARY_DAEMON_FAIL_OPEN === 'true',
      retryAttempts: parseInt(process.env.BOUNDARY_DAEMON_RETRIES || '3', 10),
    },
    boundarySIEM: {
      enabled: siemEnabled,
      baseUrl: process.env.BOUNDARY_SIEM_URL || 'http://localhost:8080',
      apiToken: process.env.BOUNDARY_SIEM_TOKEN,
      timeout: parseInt(process.env.BOUNDARY_SIEM_TIMEOUT || '10000', 10),
      batchEnabled: process.env.BOUNDARY_SIEM_BATCH_ENABLED !== 'false',
      batchSize: parseInt(process.env.BOUNDARY_SIEM_BATCH_SIZE || '100', 10),
      batchFlushInterval: parseInt(process.env.BOUNDARY_SIEM_FLUSH_INTERVAL || '5000', 10),
      retryAttempts: parseInt(process.env.BOUNDARY_SIEM_RETRIES || '3', 10),
      sourceId: process.env.BOUNDARY_SIEM_SOURCE_ID || 'mediator-node',
    },
  };
}

/**
 * Default security apps configuration
 */
export const DEFAULT_SECURITY_APPS_CONFIG: SecurityAppsConfig = {
  enabled: false,
  boundaryDaemon: {
    enabled: false,
    baseUrl: 'http://localhost:9000',
    timeout: 5000,
    failOpen: false,
    retryAttempts: 3,
  },
  boundarySIEM: {
    enabled: false,
    baseUrl: 'http://localhost:8080',
    timeout: 10000,
    batchEnabled: true,
    batchSize: 100,
    batchFlushInterval: 5000,
    retryAttempts: 3,
    sourceId: 'mediator-node',
  },
};

/**
 * Validate security apps configuration
 */
export function validateSecurityAppsConfig(config: SecurityAppsConfig): string[] {
  const errors: string[] = [];

  if (config.boundaryDaemon.enabled) {
    if (!config.boundaryDaemon.baseUrl && !config.boundaryDaemon.socketPath) {
      errors.push('Boundary Daemon: Either baseUrl or socketPath must be configured');
    }
    if (config.boundaryDaemon.timeout < 100) {
      errors.push('Boundary Daemon: timeout must be at least 100ms');
    }
    if (config.boundaryDaemon.retryAttempts < 0) {
      errors.push('Boundary Daemon: retryAttempts must be non-negative');
    }
  }

  if (config.boundarySIEM.enabled) {
    if (!config.boundarySIEM.baseUrl) {
      errors.push('Boundary SIEM: baseUrl must be configured');
    }
    if (config.boundarySIEM.timeout < 100) {
      errors.push('Boundary SIEM: timeout must be at least 100ms');
    }
    if (config.boundarySIEM.batchSize < 1) {
      errors.push('Boundary SIEM: batchSize must be at least 1');
    }
    if (config.boundarySIEM.batchFlushInterval < 100) {
      errors.push('Boundary SIEM: batchFlushInterval must be at least 100ms');
    }
  }

  return errors;
}
