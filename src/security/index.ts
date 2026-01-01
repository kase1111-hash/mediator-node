/**
 * Security Module
 *
 * Automated security testing, vulnerability scanning, and integration with
 * external security applications for the mediator node.
 *
 * Security Apps:
 * - Boundary Daemon: Policy enforcement and audit logging
 *   @see https://github.com/kase1111-hash/boundary-daemon-
 * - Boundary SIEM: Security event management and threat detection
 *   @see https://github.com/kase1111-hash/Boundary-SIEM
 */

// Vulnerability scanning
export { VulnerabilityScanner, VulnerabilityFinding, ScanResult, VulnerabilitySeverity } from './VulnerabilityScanner';
export { SecurityTestRunner, SecurityTestResult, SecurityTestSuiteResult, SecurityTestCategory } from './SecurityTestRunner';
export { SecurityReportGenerator, SecurityReport, ReportFormat, ReportOptions } from './SecurityReportGenerator';

// Boundary Daemon integration
export {
  BoundaryDaemonClient,
  BoundaryMode,
  MemoryClass,
  PolicyDecision,
  AuditEvent,
  AuditLogEntry,
  EnvironmentStatus,
  BoundaryDaemonConfig,
} from './BoundaryDaemonClient';

// Boundary SIEM integration
export {
  BoundarySIEMClient,
  SIEMSeverity,
  EventCategory,
  MITRETactic,
  SecurityEvent,
  EventResponse,
  SIEMAlert,
  EventQueryFilters,
  BoundarySIEMConfig,
} from './BoundarySIEMClient';

// Security Apps configuration
export {
  SecurityAppsConfig,
  loadSecurityAppsConfig,
  validateSecurityAppsConfig,
  DEFAULT_SECURITY_APPS_CONFIG,
} from './SecurityAppsConfig';

// Security Apps Manager
export {
  SecurityAppsManager,
  SecurityAppsHealth,
  SecurityActionContext,
  getSecurityAppsManager,
  resetSecurityAppsManager,
} from './SecurityAppsManager';
