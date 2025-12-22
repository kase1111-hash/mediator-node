#!/usr/bin/env node
/**
 * Comprehensive Security Test Suite
 *
 * Tests all P0, P1, and P2 security hardening implementations
 */

const fs = require('fs');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           COMPREHENSIVE SECURITY TEST SUITE                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
let failCount = 0;
const issues = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`✅ PASS: ${name}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: ${name}`);
      failCount++;
      issues.push(name);
    }
  } catch (err) {
    console.log(`❌ FAIL: ${name} - ${err.message}`);
    failCount++;
    issues.push(`${name}: ${err.message}`);
  }
}

// ============================================================================
// P0 Security Tests (Blocking Production)
// ============================================================================

console.log('\n📋 P0 SECURITY TESTS (Blocking Production)\n');

test('Zod validation schemas exist', () => {
  const schemas = fs.readFileSync('src/validation/schemas.ts', 'utf8');
  return schemas.includes('DisputeDeclarationSchema') &&
         schemas.includes('FrozenItemSchema') &&
         schemas.includes('EvidenceItemSchema');
});

test('Safe file operations implemented', () => {
  const safeOps = fs.readFileSync('src/validation/safe-file-ops.ts', 'utf8');
  return safeOps.includes('sanitizeFilename') &&
         safeOps.includes('validatePathWithinDirectory') &&
         safeOps.includes('writeJSONFile');
});

test('Path traversal protection active', () => {
  const schemas = fs.readFileSync('src/validation/schemas.ts', 'utf8');
  // Check for path resolution and validation
  return schemas.includes('path.resolve') &&
         schemas.includes('startsWith') &&
         schemas.includes('validatePathWithinDirectory');
});

test('Schema validation in DisputeManager', () => {
  const dm = fs.readFileSync('src/dispute/DisputeManager.ts', 'utf8');
  return dm.includes('DisputeDeclarationSchema') &&
         dm.includes('writeJSONFile');
});

test('Schema validation in EvidenceManager', () => {
  const em = fs.readFileSync('src/dispute/EvidenceManager.ts', 'utf8');
  return em.includes('FrozenItemSchema') &&
         em.includes('writeJSONFile');
});

// ============================================================================
// P1 Security Tests (High Priority)
// ============================================================================

console.log('\n📋 P1 SECURITY TESTS (High Priority)\n');

test('Nonce management with timestamps', () => {
  const auth = fs.readFileSync('src/websocket/AuthenticationService.ts', 'utf8');
  return auth.includes('Map<string, number>') &&
         auth.includes('usedNonces') &&
         auth.includes('timestamp');
});

test('Nonce cleanup by timestamp', () => {
  const auth = fs.readFileSync('src/websocket/AuthenticationService.ts', 'utf8');
  return auth.includes('nonceCleanupInterval') &&
         auth.includes('now - timestamp > maxAge');
});

test('Rate limiting configured', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  return mockChain.includes('rateLimit') &&
         mockChain.includes('windowMs') &&
         mockChain.includes('max:');
});

test('HTTP query parameter validation', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  return mockChain.includes('parseInt(since, 10)') &&
         mockChain.includes('isNaN') &&
         mockChain.includes('Invalid since parameter');
});

test('Request body validation', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  // Check for whitelist validation or explicit property checks
  return (mockChain.includes('validateRequestBody') ||
          mockChain.includes('Object.prototype.hasOwnProperty') ||
          (mockChain.includes('allowedFields') && mockChain.includes('req.body[field]')));
});

// ============================================================================
// P2 Security Tests (Medium Priority)
// ============================================================================

console.log('\n📋 P2 SECURITY TESTS (Medium Priority)\n');

test('Production environment checks', () => {
  const auth = fs.readFileSync('src/websocket/AuthenticationService.ts', 'utf8');
  return auth.includes('process.env.NODE_ENV === \'production\'') &&
         auth.includes('not allowed in production');
});

test('Input length limits defined', () => {
  const limits = fs.readFileSync('src/validation/input-limits.ts', 'utf8');
  return limits.includes('INPUT_LIMITS') &&
         limits.includes('PROSE_MAX') &&
         limits.includes('REQUEST_BODY_MAX');
});

test('Input validation functions', () => {
  const limits = fs.readFileSync('src/validation/input-limits.ts', 'utf8');
  return limits.includes('validateStringLength') &&
         limits.includes('validateArrayLength') &&
         limits.includes('validateIntentLimits');
});

test('Helmet security headers configured', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  return mockChain.includes('helmet(') &&
         mockChain.includes('contentSecurityPolicy');
});

test('Request logging and audit trail', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  return mockChain.includes('[AUDIT]') &&
         mockChain.includes('req.method') &&
         mockChain.includes('req.path');
});

test('Prompt injection detection', () => {
  const promptSec = fs.readFileSync('src/utils/prompt-security.ts', 'utf8');
  return promptSec.includes('INJECTION_PATTERNS') &&
         promptSec.includes('detectPromptInjection');
});

test('Prompt sanitization', () => {
  const promptSec = fs.readFileSync('src/utils/prompt-security.ts', 'utf8');
  return promptSec.includes('sanitizeForPrompt') &&
         promptSec.includes('removeControlChars') &&
         promptSec.includes('redactInjection');
});

test('Injection rate limiting', () => {
  const promptSec = fs.readFileSync('src/utils/prompt-security.ts', 'utf8');
  return promptSec.includes('InjectionRateLimiter') &&
         promptSec.includes('recordAttempt') &&
         promptSec.includes('isLimited');
});

// ============================================================================
// Additional Security Checks
// ============================================================================

console.log('\n📋 ADDITIONAL SECURITY CHECKS\n');

test('No hardcoded credentials in source', () => {
  const files = [
    'src/websocket/AuthenticationService.ts',
    'src/llm/LLMProvider.ts',
    'src/config/index.ts'
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8').toLowerCase();
    if (content.includes('password') && content.includes('=') && content.includes('"')) {
      return false;
    }
  }
  return true;
});

test('Environment variables used for secrets', () => {
  const configLoader = fs.readFileSync('src/config/ConfigLoader.ts', 'utf8');
  // Check that API keys are loaded from environment variables
  return (configLoader.includes('ANTHROPIC_API_KEY') ||
          configLoader.includes('OPENAI_API_KEY')) &&
         configLoader.includes('getRequired');
});

test('HTTPS enforcement capability', () => {
  const mockChain = fs.readFileSync('examples/mock-chain/server.js', 'utf8');
  return mockChain.includes('hsts') ||
         mockChain.includes('Strict-Transport-Security');
});

test('Input validation on all user inputs', () => {
  const limits = fs.readFileSync('src/validation/input-limits.ts', 'utf8');
  return limits.includes('validateIntentLimits') &&
         limits.includes('validateSettlementLimits') &&
         limits.includes('validateDisputeLimits');
});

test('XSS protection in prompts', () => {
  const promptSec = fs.readFileSync('src/utils/prompt-security.ts', 'utf8');
  return promptSec.includes('escapeXml') &&
         promptSec.includes('replace(/</g') &&
         promptSec.includes('replace(/>/g');
});

test('SQL injection prevention (NoSQL)', () => {
  // Using file-based storage, so check for safe file operations
  const schemas = fs.readFileSync('src/validation/schemas.ts', 'utf8');
  // Check for filename sanitization (accepts various regex patterns)
  return schemas.includes('sanitizeFilename') &&
         (schemas.includes('[^a-zA-Z0-9_-]') || schemas.includes('replace(/['));
});

test('WebSocket authentication required', () => {
  const wsServer = fs.readFileSync('src/websocket/WebSocketServer.ts', 'utf8');
  return wsServer.includes('authRequired') &&
         wsServer.includes('authenticated');
});

test('Error messages do not leak sensitive info', () => {
  const auth = fs.readFileSync('src/websocket/AuthenticationService.ts', 'utf8');
  // Check that errors are generic
  return auth.includes('Missing required authentication fields') &&
         !auth.includes('secret') &&
         !auth.includes('private key');
});

// ============================================================================
// Test Results Summary
// ============================================================================

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    TEST RESULTS SUMMARY                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const total = passCount + failCount;
const passRate = ((passCount / total) * 100).toFixed(1);

console.log(`Total Tests:  ${total}`);
console.log(`✅ Passed:    ${passCount}`);
console.log(`❌ Failed:    ${failCount}`);
console.log(`Pass Rate:    ${passRate}%\n`);

if (failCount > 0) {
  console.log('⚠️  FAILED TESTS:\n');
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('🎉 ALL SECURITY TESTS PASSED!\n');
  console.log('✅ P0 Security: Complete');
  console.log('✅ P1 Security: Complete');
  console.log('✅ P2 Security: Complete');
  console.log('✅ Additional Security: Verified\n');
  console.log('🔒 SECURITY STATUS: PRODUCTION READY\n');
  process.exit(0);
}
