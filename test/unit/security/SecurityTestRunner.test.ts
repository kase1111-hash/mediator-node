import * as fs from 'fs';
import * as path from 'path';
import { SecurityTestRunner, SecurityTestSuiteResult, SecurityTestCategory } from '../../../src/security/SecurityTestRunner';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SecurityTestRunner', () => {
  let runner: SecurityTestRunner;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'temp-runner-test');

    // Create temp directory with a simple TypeScript file
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(path.join(tempDir, 'app.ts'), 'const x = 1;');

    runner = new SecurityTestRunner(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should initialize with default test cases', () => {
      const counts = runner.getTestCaseCount();
      const totalTests = Object.values(counts).reduce((a, b) => a + b, 0);

      expect(totalTests).toBeGreaterThan(0);
    });

    it('should have tests for multiple categories', () => {
      const counts = runner.getTestCaseCount();
      const categories = Object.keys(counts);

      expect(categories.length).toBeGreaterThan(3);
    });

    it('should include prompt injection tests', () => {
      const counts = runner.getTestCaseCount();
      expect(counts['prompt-injection']).toBeGreaterThan(0);
    });

    it('should include path traversal tests', () => {
      const counts = runner.getTestCaseCount();
      expect(counts['path-traversal']).toBeGreaterThan(0);
    });

    it('should include input validation tests', () => {
      const counts = runner.getTestCaseCount();
      expect(counts['input-validation']).toBeGreaterThan(0);
    });
  });

  describe('runAllTests', () => {
    it('should run all test cases and vulnerability scan', async () => {
      const result = await runner.runAllTests();

      expect(result.suiteId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.vulnerabilityScan).toBeDefined();
    });

    it('should include summary with counts', async () => {
      const result = await runner.runAllTests();

      expect(result.summary.total).toBeGreaterThan(0);
      expect(result.summary.passed).toBeGreaterThanOrEqual(0);
      expect(result.summary.failed).toBeGreaterThanOrEqual(0);
      expect(result.summary.passRate).toBeGreaterThanOrEqual(0);
      expect(result.summary.passRate).toBeLessThanOrEqual(100);
    });

    it('should set overallPassed based on test results', async () => {
      const result = await runner.runAllTests();

      if (result.summary.failed === 0) {
        expect(result.overallPassed).toBe(true);
      } else {
        expect(result.overallPassed).toBe(false);
      }
    });

    it('should include test duration for each test', async () => {
      const result = await runner.runAllTests();

      for (const test of result.tests) {
        expect(test.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include details for each test', async () => {
      const result = await runner.runAllTests();

      for (const test of result.tests) {
        expect(test.details).toBeDefined();
        expect(typeof test.details).toBe('string');
      }
    });
  });

  describe('runTestsByCategory', () => {
    it('should run only prompt injection tests', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');

      for (const result of results) {
        expect(result.category).toBe('prompt-injection');
      }
    });

    it('should run only path traversal tests', async () => {
      const results = await runner.runTestsByCategory('path-traversal');

      for (const result of results) {
        expect(result.category).toBe('path-traversal');
      }
    });

    it('should return empty array for unknown category', async () => {
      const results = await runner.runTestsByCategory('unknown-category' as SecurityTestCategory);

      expect(results.length).toBe(0);
    });
  });

  describe('runVulnerabilityScan', () => {
    it('should run vulnerability scan on source directory', async () => {
      const result = await runner.runVulnerabilityScan();

      expect(result.scanId).toBeDefined();
      expect(result.filesScanned).toBeGreaterThanOrEqual(0);
      expect(result.summary).toBeDefined();
    });
  });

  describe('addTestCase', () => {
    it('should allow adding custom test cases', async () => {
      const initialCounts = runner.getTestCaseCount();
      const initialTotal = Object.values(initialCounts).reduce((a, b) => a + b, 0);

      runner.addTestCase({
        name: 'Custom security test',
        category: 'authentication',
        test: async () => ({ passed: true, details: 'Custom test passed' }),
      });

      const newCounts = runner.getTestCaseCount();
      const newTotal = Object.values(newCounts).reduce((a, b) => a + b, 0);

      expect(newTotal).toBe(initialTotal + 1);
    });

    it('should run added custom test cases', async () => {
      runner.addTestCase({
        name: 'Custom test that always passes',
        category: 'authentication',
        test: async () => ({ passed: true, details: 'Custom test executed' }),
      });

      const results = await runner.runTestsByCategory('authentication');
      const customTest = results.find((r) => r.name === 'Custom test that always passes');

      expect(customTest).toBeDefined();
      expect(customTest?.passed).toBe(true);
    });
  });

  describe('prompt injection tests', () => {
    it('should detect ignore instructions pattern', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');
      const ignoreTest = results.find((r) => r.name.includes('ignore instructions'));

      expect(ignoreTest?.passed).toBe(true);
    });

    it('should detect role manipulation pattern', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');
      const roleTest = results.find((r) => r.name.includes('role manipulation'));

      expect(roleTest?.passed).toBe(true);
    });

    it('should detect system commands pattern', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');
      const systemTest = results.find((r) => r.name.includes('system commands'));

      expect(systemTest?.passed).toBe(true);
    });

    it('should detect jailbreak attempts', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');
      const jailbreakTest = results.find((r) => r.name.includes('jailbreak'));

      expect(jailbreakTest?.passed).toBe(true);
    });

    it('should allow legitimate content', async () => {
      const results = await runner.runTestsByCategory('prompt-injection');
      const legitimateTest = results.find((r) => r.name.includes('legitimate content'));

      expect(legitimateTest?.passed).toBe(true);
    });
  });

  describe('path traversal tests', () => {
    it('should block parent directory traversal', async () => {
      const results = await runner.runTestsByCategory('path-traversal');
      const parentTest = results.find((r) => r.name.includes('parent directory'));

      expect(parentTest?.passed).toBe(true);
    });

    it('should block encoded traversal', async () => {
      const results = await runner.runTestsByCategory('path-traversal');
      const encodedTest = results.find((r) => r.name.includes('encoded'));

      expect(encodedTest?.passed).toBe(true);
    });

    it('should allow valid paths', async () => {
      const results = await runner.runTestsByCategory('path-traversal');
      const validTest = results.find((r) => r.name.includes('Allow valid paths'));

      expect(validTest?.passed).toBe(true);
    });
  });

  describe('input validation tests', () => {
    it('should detect and sanitize malicious input', async () => {
      const results = await runner.runTestsByCategory('input-validation');
      const detectTest = results.find((r) => r.name.includes('detect and sanitize'));

      expect(detectTest?.passed).toBe(true);
    });

    it('should allow clean input', async () => {
      const results = await runner.runTestsByCategory('input-validation');
      const cleanTest = results.find((r) => r.name.includes('allow clean input'));

      expect(cleanTest?.passed).toBe(true);
    });

    it('should truncate oversized input', async () => {
      const results = await runner.runTestsByCategory('input-validation');
      const truncateTest = results.find((r) => r.name.includes('Truncate oversized'));

      expect(truncateTest?.passed).toBe(true);
    });

    it('should remove control characters', async () => {
      const results = await runner.runTestsByCategory('input-validation');
      const controlTest = results.find((r) => r.name.includes('control characters'));

      expect(controlTest?.passed).toBe(true);
    });

    it('should escape XML/HTML tags', async () => {
      const results = await runner.runTestsByCategory('input-validation');
      const escapeTest = results.find((r) => r.name.includes('Escape XML'));

      expect(escapeTest?.passed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle test case errors gracefully', async () => {
      runner.addTestCase({
        name: 'Test that throws error',
        category: 'authentication',
        test: async () => {
          throw new Error('Test error');
        },
      });

      const results = await runner.runTestsByCategory('authentication');
      const errorTest = results.find((r) => r.name === 'Test that throws error');

      expect(errorTest).toBeDefined();
      expect(errorTest?.passed).toBe(false);
      expect(errorTest?.details).toContain('Test error');
    });
  });
});
