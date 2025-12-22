/**
 * Jest test setup
 *
 * This file runs before any tests to set up the test environment.
 */

// Set NODE_ENV to 'test' for all tests
process.env.NODE_ENV = 'test';

// Suppress console output during tests (optional - can be removed if debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
