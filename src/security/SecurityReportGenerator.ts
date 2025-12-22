/**
 * Security Report Generator
 *
 * Generates comprehensive security reports in multiple formats:
 * - Console output
 * - JSON report
 * - Markdown report
 * - HTML report
 */

import * as fs from 'fs';
import * as path from 'path';
import { SecurityTestSuiteResult, SecurityTestResult } from './SecurityTestRunner';
import { ScanResult, VulnerabilityFinding, VulnerabilitySeverity } from './VulnerabilityScanner';
import { logger } from '../utils/logger';

/**
 * Report format options
 */
export type ReportFormat = 'console' | 'json' | 'markdown' | 'html';

/**
 * Report options
 */
export interface ReportOptions {
  format: ReportFormat;
  outputPath?: string;
  includeDetails?: boolean;
  includeSummary?: boolean;
  includeRecommendations?: boolean;
}

/**
 * Security Report
 */
export interface SecurityReport {
  title: string;
  generatedAt: string;
  suiteResult: SecurityTestSuiteResult;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  recommendations: string[];
}

/**
 * SecurityReportGenerator creates formatted security reports
 */
export class SecurityReportGenerator {
  /**
   * Generate a security report
   */
  public generateReport(result: SecurityTestSuiteResult, options: ReportOptions): string {
    const report: SecurityReport = {
      title: 'Mediator Node Security Assessment Report',
      generatedAt: new Date().toISOString(),
      suiteResult: result,
      riskLevel: this.calculateRiskLevel(result),
      recommendations: this.generateRecommendations(result),
    };

    switch (options.format) {
      case 'json':
        return this.generateJSONReport(report, options);
      case 'markdown':
        return this.generateMarkdownReport(report, options);
      case 'html':
        return this.generateHTMLReport(report, options);
      case 'console':
      default:
        return this.generateConsoleReport(report, options);
    }
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(result: SecurityTestSuiteResult): SecurityReport['riskLevel'] {
    const scan = result.vulnerabilityScan;

    if (scan) {
      if (scan.summary.critical > 0) return 'critical';
      if (scan.summary.high > 0) return 'high';
      if (scan.summary.medium > 0) return 'medium';
      if (scan.summary.low > 0) return 'low';
    }

    if (!result.overallPassed) return 'medium';

    return 'none';
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(result: SecurityTestSuiteResult): string[] {
    const recommendations: string[] = [];

    // Failed test recommendations
    const failedTests = result.tests.filter((t) => !t.passed);
    for (const test of failedTests) {
      switch (test.category) {
        case 'prompt-injection':
          recommendations.push('Review and strengthen LLM input sanitization');
          break;
        case 'path-traversal':
          recommendations.push('Ensure all file paths are validated against a base directory');
          break;
        case 'input-validation':
          recommendations.push('Implement stricter input validation using Zod schemas');
          break;
        case 'authentication':
          recommendations.push('Review authentication mechanisms and signature validation');
          break;
        case 'authorization':
          recommendations.push('Audit authorization checks for all protected resources');
          break;
        case 'cryptography':
          recommendations.push('Ensure all cryptographic operations use strong algorithms');
          break;
      }
    }

    // Vulnerability scan recommendations
    if (result.vulnerabilityScan) {
      const findings = result.vulnerabilityScan.findings;
      const categories = [...new Set(findings.map((f) => f.category))];

      for (const category of categories) {
        const categoryFindings = findings.filter((f) => f.category === category);
        if (categoryFindings.length > 0) {
          recommendations.push(`Address ${categoryFindings.length} ${category} issues`);
        }
      }
    }

    // Deduplicate recommendations
    return [...new Set(recommendations)];
  }

  /**
   * Generate console report
   */
  private generateConsoleReport(report: SecurityReport, options: ReportOptions): string {
    const lines: string[] = [];
    const divider = '═'.repeat(70);
    const thinDivider = '─'.repeat(70);

    lines.push('');
    lines.push(divider);
    lines.push(`  ${report.title}`);
    lines.push(`  Generated: ${report.generatedAt}`);
    lines.push(divider);
    lines.push('');

    // Summary
    if (options.includeSummary !== false) {
      lines.push('📊 SUMMARY');
      lines.push(thinDivider);
      lines.push(`  Total Tests: ${report.suiteResult.summary.total}`);
      lines.push(`  Passed: ${report.suiteResult.summary.passed} ✅`);
      lines.push(`  Failed: ${report.suiteResult.summary.failed} ❌`);
      lines.push(`  Pass Rate: ${report.suiteResult.summary.passRate}%`);
      lines.push(`  Risk Level: ${this.formatRiskLevel(report.riskLevel)}`);
      lines.push(`  Overall: ${report.suiteResult.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
      lines.push('');
    }

    // Vulnerability Scan Results
    if (report.suiteResult.vulnerabilityScan) {
      const scan = report.suiteResult.vulnerabilityScan;
      lines.push('🔍 VULNERABILITY SCAN');
      lines.push(thinDivider);
      lines.push(`  Files Scanned: ${scan.filesScanned}`);
      lines.push(`  Findings: ${scan.summary.total}`);
      lines.push(`    Critical: ${scan.summary.critical}`);
      lines.push(`    High: ${scan.summary.high}`);
      lines.push(`    Medium: ${scan.summary.medium}`);
      lines.push(`    Low: ${scan.summary.low}`);
      lines.push(`    Info: ${scan.summary.info}`);
      lines.push('');

      if (options.includeDetails && scan.findings.length > 0) {
        lines.push('  Findings:');
        for (const finding of scan.findings.slice(0, 20)) {
          lines.push(`    [${finding.severity.toUpperCase()}] ${finding.title}`);
          lines.push(`      File: ${finding.file}:${finding.line}`);
          if (finding.cweId) {
            lines.push(`      CWE: ${finding.cweId}`);
          }
        }
        if (scan.findings.length > 20) {
          lines.push(`    ... and ${scan.findings.length - 20} more findings`);
        }
        lines.push('');
      }
    }

    // Test Results by Category
    if (options.includeDetails) {
      lines.push('📋 TEST RESULTS');
      lines.push(thinDivider);

      const categories = [...new Set(report.suiteResult.tests.map((t) => t.category))];
      for (const category of categories) {
        const categoryTests = report.suiteResult.tests.filter((t) => t.category === category);
        const passed = categoryTests.filter((t) => t.passed).length;
        lines.push(`  ${category} (${passed}/${categoryTests.length} passed)`);

        for (const test of categoryTests) {
          const icon = test.passed ? '✅' : '❌';
          lines.push(`    ${icon} ${test.name}`);
          if (!test.passed) {
            lines.push(`       ${test.details}`);
          }
        }
        lines.push('');
      }
    }

    // Recommendations
    if (options.includeRecommendations !== false && report.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS');
      lines.push(thinDivider);
      for (const rec of report.recommendations) {
        lines.push(`  • ${rec}`);
      }
      lines.push('');
    }

    lines.push(divider);
    lines.push(`  Duration: ${report.suiteResult.duration}ms`);
    lines.push(divider);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format risk level with emoji
   */
  private formatRiskLevel(level: SecurityReport['riskLevel']): string {
    switch (level) {
      case 'critical':
        return '🔴 CRITICAL';
      case 'high':
        return '🟠 HIGH';
      case 'medium':
        return '🟡 MEDIUM';
      case 'low':
        return '🟢 LOW';
      case 'none':
        return '⚪ NONE';
    }
  }

  /**
   * Generate JSON report
   */
  private generateJSONReport(report: SecurityReport, options: ReportOptions): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(report: SecurityReport, options: ReportOptions): string {
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    lines.push('');
    lines.push(`**Generated:** ${report.generatedAt}`);
    lines.push(`**Risk Level:** ${this.formatRiskLevelMarkdown(report.riskLevel)}`);
    lines.push(`**Overall Status:** ${report.suiteResult.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Tests | ${report.suiteResult.summary.total} |`);
    lines.push(`| Passed | ${report.suiteResult.summary.passed} |`);
    lines.push(`| Failed | ${report.suiteResult.summary.failed} |`);
    lines.push(`| Pass Rate | ${report.suiteResult.summary.passRate}% |`);
    lines.push(`| Duration | ${report.suiteResult.duration}ms |`);
    lines.push('');

    // Vulnerability Scan
    if (report.suiteResult.vulnerabilityScan) {
      const scan = report.suiteResult.vulnerabilityScan;
      lines.push('## Vulnerability Scan');
      lines.push('');
      lines.push(`- **Files Scanned:** ${scan.filesScanned}`);
      lines.push(`- **Total Findings:** ${scan.summary.total}`);
      lines.push('');
      lines.push('| Severity | Count |');
      lines.push('|----------|-------|');
      lines.push(`| Critical | ${scan.summary.critical} |`);
      lines.push(`| High | ${scan.summary.high} |`);
      lines.push(`| Medium | ${scan.summary.medium} |`);
      lines.push(`| Low | ${scan.summary.low} |`);
      lines.push(`| Info | ${scan.summary.info} |`);
      lines.push('');

      if (options.includeDetails && scan.findings.length > 0) {
        lines.push('### Findings');
        lines.push('');
        for (const finding of scan.findings) {
          lines.push(`#### [${finding.severity.toUpperCase()}] ${finding.title}`);
          lines.push('');
          lines.push(`- **File:** \`${finding.file}:${finding.line}\``);
          lines.push(`- **Category:** ${finding.category}`);
          if (finding.cweId) {
            lines.push(`- **CWE:** ${finding.cweId}`);
          }
          lines.push(`- **Description:** ${finding.description}`);
          lines.push(`- **Recommendation:** ${finding.recommendation}`);
          if (finding.code) {
            lines.push('');
            lines.push('```');
            lines.push(finding.code);
            lines.push('```');
          }
          lines.push('');
        }
      }
    }

    // Test Results
    lines.push('## Test Results');
    lines.push('');

    const categories = [...new Set(report.suiteResult.tests.map((t) => t.category))];
    for (const category of categories) {
      const categoryTests = report.suiteResult.tests.filter((t) => t.category === category);
      const passed = categoryTests.filter((t) => t.passed).length;
      lines.push(`### ${category} (${passed}/${categoryTests.length})`);
      lines.push('');
      lines.push('| Test | Status | Details |');
      lines.push('|------|--------|---------|');
      for (const test of categoryTests) {
        const status = test.passed ? '✅' : '❌';
        lines.push(`| ${test.name} | ${status} | ${test.details} |`);
      }
      lines.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format risk level for markdown
   */
  private formatRiskLevelMarkdown(level: SecurityReport['riskLevel']): string {
    switch (level) {
      case 'critical':
        return '🔴 **CRITICAL**';
      case 'high':
        return '🟠 **HIGH**';
      case 'medium':
        return '🟡 **MEDIUM**';
      case 'low':
        return '🟢 **LOW**';
      case 'none':
        return '⚪ **NONE**';
    }
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(report: SecurityReport, options: ReportOptions): string {
    const riskColors: Record<SecurityReport['riskLevel'], string> = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#28a745',
      none: '#6c757d',
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #1a1a2e; color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { margin: 0 0 10px 0; }
    .header .meta { opacity: 0.8; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .summary-item { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .summary-item .value { font-size: 28px; font-weight: bold; }
    .summary-item .label { font-size: 12px; color: #666; text-transform: uppercase; }
    .risk-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; color: white; font-weight: bold; }
    .status-pass { color: #28a745; }
    .status-fail { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    .severity-critical { color: #dc3545; }
    .severity-high { color: #fd7e14; }
    .severity-medium { color: #ffc107; }
    .severity-low { color: #28a745; }
    .severity-info { color: #17a2b8; }
    .recommendations li { margin: 10px 0; }
    .findings-list { max-height: 400px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${report.title}</h1>
      <div class="meta">
        Generated: ${report.generatedAt} | Duration: ${report.suiteResult.duration}ms
      </div>
    </div>

    <div class="card">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="value">${report.suiteResult.summary.total}</div>
          <div class="label">Total Tests</div>
        </div>
        <div class="summary-item">
          <div class="value status-pass">${report.suiteResult.summary.passed}</div>
          <div class="label">Passed</div>
        </div>
        <div class="summary-item">
          <div class="value status-fail">${report.suiteResult.summary.failed}</div>
          <div class="label">Failed</div>
        </div>
        <div class="summary-item">
          <div class="value">${report.suiteResult.summary.passRate}%</div>
          <div class="label">Pass Rate</div>
        </div>
        <div class="summary-item">
          <div class="risk-badge" style="background: ${riskColors[report.riskLevel]}">${report.riskLevel.toUpperCase()}</div>
          <div class="label" style="margin-top: 5px">Risk Level</div>
        </div>
        <div class="summary-item">
          <div class="value ${report.suiteResult.overallPassed ? 'status-pass' : 'status-fail'}">
            ${report.suiteResult.overallPassed ? '✅ PASSED' : '❌ FAILED'}
          </div>
          <div class="label">Overall Status</div>
        </div>
      </div>
    </div>

    ${report.suiteResult.vulnerabilityScan ? this.generateVulnerabilityScanHTML(report.suiteResult.vulnerabilityScan) : ''}

    <div class="card">
      <h2>Test Results</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Test Name</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${report.suiteResult.tests.map((t) => `
            <tr>
              <td>${t.category}</td>
              <td>${t.name}</td>
              <td class="${t.passed ? 'status-pass' : 'status-fail'}">${t.passed ? '✅ Pass' : '❌ Fail'}</td>
              <td>${t.details}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${report.recommendations.length > 0 ? `
    <div class="card">
      <h2>Recommendations</h2>
      <ul class="recommendations">
        ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
  </div>
</body>
</html>`;
  }

  /**
   * Generate vulnerability scan HTML section
   */
  private generateVulnerabilityScanHTML(scan: ScanResult): string {
    return `
    <div class="card">
      <h2>Vulnerability Scan</h2>
      <div class="summary-grid" style="margin-bottom: 20px">
        <div class="summary-item">
          <div class="value">${scan.filesScanned}</div>
          <div class="label">Files Scanned</div>
        </div>
        <div class="summary-item">
          <div class="value severity-critical">${scan.summary.critical}</div>
          <div class="label">Critical</div>
        </div>
        <div class="summary-item">
          <div class="value severity-high">${scan.summary.high}</div>
          <div class="label">High</div>
        </div>
        <div class="summary-item">
          <div class="value severity-medium">${scan.summary.medium}</div>
          <div class="label">Medium</div>
        </div>
        <div class="summary-item">
          <div class="value severity-low">${scan.summary.low}</div>
          <div class="label">Low</div>
        </div>
      </div>
      ${scan.findings.length > 0 ? `
      <h3>Findings</h3>
      <div class="findings-list">
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Title</th>
              <th>File</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            ${scan.findings.map((f) => `
              <tr>
                <td class="severity-${f.severity}">${f.severity.toUpperCase()}</td>
                <td>${f.title}</td>
                <td>${f.file?.split('/').pop() || 'N/A'}</td>
                <td>${f.line || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : '<p>No findings detected.</p>'}
    </div>`;
  }

  /**
   * Save report to file
   */
  public saveReport(report: string, outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, report, 'utf-8');
    logger.info('Security report saved', { outputPath });
  }
}
