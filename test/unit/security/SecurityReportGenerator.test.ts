import * as fs from 'fs';
import * as path from 'path';
import { SecurityReportGenerator, ReportFormat } from '../../../src/security/SecurityReportGenerator';
import { SecurityTestSuiteResult } from '../../../src/security/SecurityTestRunner';
import { ScanResult } from '../../../src/security/VulnerabilityScanner';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SecurityReportGenerator', () => {
  let generator: SecurityReportGenerator;
  let mockSuiteResult: SecurityTestSuiteResult;
  let tempDir: string;

  beforeEach(() => {
    generator = new SecurityReportGenerator();
    tempDir = path.join(__dirname, 'temp-report-test');

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create mock suite result
    mockSuiteResult = {
      suiteId: 'test-suite-123',
      timestamp: Date.now(),
      duration: 1500,
      tests: [
        {
          testId: 'test-1',
          category: 'prompt-injection',
          name: 'Test prompt injection detection',
          passed: true,
          duration: 100,
          details: 'Successfully detected injection',
        },
        {
          testId: 'test-2',
          category: 'path-traversal',
          name: 'Test path validation',
          passed: true,
          duration: 50,
          details: 'Path validation working',
        },
        {
          testId: 'test-3',
          category: 'input-validation',
          name: 'Test input sanitization',
          passed: false,
          duration: 75,
          details: 'Failed to sanitize XSS payload',
        },
      ],
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        passRate: 67,
      },
      vulnerabilityScan: {
        scanId: 'scan-123',
        timestamp: Date.now(),
        duration: 500,
        filesScanned: 10,
        findings: [
          {
            id: 'VULN-1',
            category: 'Command Injection',
            severity: 'high',
            title: 'Potential eval() usage',
            description: 'Detected eval() which can lead to code injection',
            file: '/src/test.ts',
            line: 10,
            code: 'eval(userInput)',
            recommendation: 'Remove eval and use safer alternatives',
            cweId: 'CWE-94',
            owaspCategory: 'A03:2021-Injection',
          },
        ],
        summary: {
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
          total: 1,
        },
        passed: false,
      },
      overallPassed: false,
    };
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateReport', () => {
    describe('console format', () => {
      it('should generate console report', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'console',
          includeDetails: true,
          includeSummary: true,
          includeRecommendations: true,
        });

        expect(report).toContain('Security Assessment Report');
        expect(report).toContain('SUMMARY');
        expect(report).toContain('Total Tests: 3');
        expect(report).toContain('Passed: 2');
        expect(report).toContain('Failed: 1');
      });

      it('should include vulnerability scan section', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'console',
          includeDetails: true,
        });

        expect(report).toContain('VULNERABILITY SCAN');
        expect(report).toContain('Files Scanned: 10');
      });

      it('should include recommendations', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'console',
          includeRecommendations: true,
        });

        expect(report).toContain('RECOMMENDATIONS');
      });

      it('should show risk level', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'console',
          includeSummary: true,
        });

        expect(report).toContain('Risk Level');
      });

      it('should show overall status', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'console',
        });

        expect(report).toContain('FAILED');
      });
    });

    describe('json format', () => {
      it('should generate valid JSON report', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'json',
        });

        const parsed = JSON.parse(report);
        expect(parsed.title).toBeDefined();
        expect(parsed.generatedAt).toBeDefined();
        expect(parsed.suiteResult).toBeDefined();
        expect(parsed.riskLevel).toBeDefined();
        expect(parsed.recommendations).toBeDefined();
      });

      it('should include all suite results in JSON', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'json',
        });

        const parsed = JSON.parse(report);
        expect(parsed.suiteResult.tests.length).toBe(3);
        expect(parsed.suiteResult.vulnerabilityScan).toBeDefined();
      });
    });

    describe('markdown format', () => {
      it('should generate markdown report', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'markdown',
          includeDetails: true,
        });

        expect(report).toContain('# ');
        expect(report).toContain('## Summary');
        expect(report).toContain('| Metric | Value |');
      });

      it('should include vulnerability scan table', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'markdown',
          includeDetails: true,
        });

        expect(report).toContain('## Vulnerability Scan');
        expect(report).toContain('| Severity | Count |');
      });

      it('should include test results table', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'markdown',
        });

        expect(report).toContain('## Test Results');
        expect(report).toContain('| Test | Status | Details |');
      });

      it('should show pass/fail status with emoji', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'markdown',
        });

        expect(report).toContain('✅');
        expect(report).toContain('❌');
      });
    });

    describe('html format', () => {
      it('should generate valid HTML report', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'html',
        });

        expect(report).toContain('<!DOCTYPE html>');
        expect(report).toContain('<html');
        expect(report).toContain('</html>');
      });

      it('should include styled summary grid', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'html',
        });

        expect(report).toContain('summary-grid');
        expect(report).toContain('Total Tests');
        expect(report).toContain('Passed');
        expect(report).toContain('Failed');
      });

      it('should include test results table', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'html',
        });

        expect(report).toContain('<table>');
        expect(report).toContain('Test Results');
      });

      it('should include vulnerability scan section', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'html',
        });

        expect(report).toContain('Vulnerability Scan');
        expect(report).toContain('Files Scanned');
      });

      it('should include risk level badge with color', () => {
        const report = generator.generateReport(mockSuiteResult, {
          format: 'html',
        });

        expect(report).toContain('risk-badge');
      });
    });
  });

  describe('risk level calculation', () => {
    it('should calculate critical risk level for critical findings', () => {
      mockSuiteResult.vulnerabilityScan!.summary.critical = 1;
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.riskLevel).toBe('critical');
    });

    it('should calculate high risk level for high findings', () => {
      mockSuiteResult.vulnerabilityScan!.summary.critical = 0;
      mockSuiteResult.vulnerabilityScan!.summary.high = 1;
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.riskLevel).toBe('high');
    });

    it('should calculate medium risk level for medium findings', () => {
      mockSuiteResult.vulnerabilityScan!.summary.critical = 0;
      mockSuiteResult.vulnerabilityScan!.summary.high = 0;
      mockSuiteResult.vulnerabilityScan!.summary.medium = 1;
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.riskLevel).toBe('medium');
    });

    it('should calculate none risk level when all pass', () => {
      mockSuiteResult.vulnerabilityScan!.summary = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0,
      };
      mockSuiteResult.overallPassed = true;
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.riskLevel).toBe('none');
    });
  });

  describe('recommendations', () => {
    it('should generate recommendations for failed tests', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate unique recommendations', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      const uniqueRecs = [...new Set(parsed.recommendations)];
      expect(uniqueRecs.length).toBe(parsed.recommendations.length);
    });
  });

  describe('saveReport', () => {
    it('should save report to file', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const outputPath = path.join(tempDir, 'report.json');

      generator.saveReport(report, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toBe(report);
    });

    it('should create directory if it does not exist', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      const outputPath = path.join(nestedDir, 'report.json');

      generator.saveReport(report, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should save HTML report correctly', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'html' });
      const outputPath = path.join(tempDir, 'report.html');

      generator.saveReport(report, outputPath);

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
    });

    it('should save markdown report correctly', () => {
      const report = generator.generateReport(mockSuiteResult, { format: 'markdown' });
      const outputPath = path.join(tempDir, 'report.md');

      generator.saveReport(report, outputPath);

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('# ');
    });
  });

  describe('edge cases', () => {
    it('should handle empty test results', () => {
      mockSuiteResult.tests = [];
      mockSuiteResult.summary = { total: 0, passed: 0, failed: 0, passRate: 100 };

      const report = generator.generateReport(mockSuiteResult, { format: 'json' });
      const parsed = JSON.parse(report);

      expect(parsed.suiteResult.tests.length).toBe(0);
    });

    it('should handle missing vulnerability scan', () => {
      mockSuiteResult.vulnerabilityScan = undefined;

      const report = generator.generateReport(mockSuiteResult, { format: 'console' });

      expect(report).not.toContain('VULNERABILITY SCAN');
    });

    it('should handle empty findings', () => {
      mockSuiteResult.vulnerabilityScan!.findings = [];

      const report = generator.generateReport(mockSuiteResult, {
        format: 'console',
        includeDetails: true,
      });

      expect(report).toContain('VULNERABILITY SCAN');
    });
  });
});
