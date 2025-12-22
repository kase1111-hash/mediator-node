import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthenticationService } from '../../src/websocket/AuthenticationService';
import { AuthenticationMessage } from '../../src/types';

describe('AuthenticationService', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    authService = new AuthenticationService({
      maxAge: 5 * 60 * 1000, // 5 minutes
      requireNonce: true,
    });
  });

  afterEach(() => {
    authService.destroy();
  });

  describe('Message Validation', () => {
    it('should reject messages with missing identity', async () => {
      const message = {
        action: 'authenticate' as const,
        identity: '',
        signature: 'test-signature',
        timestamp: Date.now(),
        nonce: 'test-nonce',
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });

    it('should reject messages with missing signature', async () => {
      const message = {
        action: 'authenticate' as const,
        identity: 'test-user',
        signature: '',
        timestamp: Date.now(),
        nonce: 'test-nonce',
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });

    it('should reject messages with missing timestamp', async () => {
      const message = {
        action: 'authenticate' as const,
        identity: 'test-user',
        signature: 'test-signature',
        timestamp: 0,
        nonce: 'test-nonce',
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
    });
  });

  describe('Timestamp Validation', () => {
    it('should accept fresh timestamps', async () => {
      const timestamp = Date.now();
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        timestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(true);
      expect(result.identity).toBe('test-user');
    });

    it('should reject old timestamps', async () => {
      const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        oldTimestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp: oldTimestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timestamp too old');
    });

    it('should reject future timestamps', async () => {
      const futureTimestamp = Date.now() + 10 * 60 * 1000; // 10 minutes in future
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        futureTimestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp: futureTimestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timestamp too old');
    });
  });

  describe('Nonce Validation', () => {
    it('should require nonce when configured', async () => {
      const timestamp = Date.now();
      const signature = AuthenticationService.createSignature('test-user', timestamp, '');

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nonce required');
    });

    it('should accept unique nonces', async () => {
      const timestamp = Date.now();
      const nonce1 = AuthenticationService.generateNonce();
      const nonce2 = AuthenticationService.generateNonce();

      const sig1 = AuthenticationService.createSignature('test-user', timestamp, nonce1);
      const sig2 = AuthenticationService.createSignature('test-user', timestamp, nonce2);

      const message1: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature: sig1,
        timestamp,
        nonce: nonce1,
      };

      const message2: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature: sig2,
        timestamp,
        nonce: nonce2,
      };

      const result1 = await authService.verify(message1);
      const result2 = await authService.verify(message2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should reject reused nonces', async () => {
      const timestamp = Date.now();
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        timestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp,
        nonce,
      };

      // First attempt should succeed
      const result1 = await authService.verify(message);
      expect(result1.success).toBe(true);

      // Second attempt with same nonce should fail
      const result2 = await authService.verify(message);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Nonce already used');
    });

    it('should work without nonce requirement', async () => {
      const noNonceService = new AuthenticationService({
        requireNonce: false,
      });

      const timestamp = Date.now();
      const signature = AuthenticationService.createSignature('test-user', timestamp, '');

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp,
      };

      const result = await noNonceService.verify(message);

      expect(result.success).toBe(true);

      noNonceService.destroy();
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid hash-based signatures', async () => {
      const timestamp = Date.now();
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        timestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(true);
      expect(result.identity).toBe('test-user');
    });

    it('should reject invalid signatures', async () => {
      const timestamp = Date.now();
      const nonce = AuthenticationService.generateNonce();

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature: 'invalid-signature',
        timestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject signatures with wrong identity', async () => {
      const timestamp = Date.now();
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'user-a',
        timestamp,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'user-b', // Different identity
        signature,
        timestamp,
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject signatures with wrong timestamp', async () => {
      const timestamp1 = Date.now();
      const timestamp2 = timestamp1 + 1000;
      const nonce = AuthenticationService.generateNonce();
      const signature = AuthenticationService.createSignature(
        'test-user',
        timestamp1,
        nonce
      );

      const message: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'test-user',
        signature,
        timestamp: timestamp2, // Different timestamp
        nonce,
      };

      const result = await authService.verify(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });
  });

  describe('Custom Verification', () => {
    it('should use custom verification function when provided', async () => {
      const customService = new AuthenticationService({
        customVerify: async (message) => {
          if (message.identity === 'admin') {
            return {
              success: true,
              identity: message.identity,
              metadata: { role: 'admin' },
            };
          }

          return {
            success: false,
            error: 'Only admins allowed',
          };
        },
      });

      const adminMessage: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'admin',
        signature: 'test',
        timestamp: Date.now(),
      };

      const userMessage: AuthenticationMessage = {
        action: 'authenticate',
        identity: 'user',
        signature: 'test',
        timestamp: Date.now(),
      };

      const adminResult = await customService.verify(adminMessage);
      const userResult = await customService.verify(userMessage);

      expect(adminResult.success).toBe(true);
      expect(adminResult.metadata?.role).toBe('admin');

      expect(userResult.success).toBe(false);
      expect(userResult.error).toContain('Only admins');

      customService.destroy();
    });
  });

  describe('Helper Methods', () => {
    it('should generate unique nonces', () => {
      const nonce1 = AuthenticationService.generateNonce();
      const nonce2 = AuthenticationService.generateNonce();

      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(0);
      expect(nonce2.length).toBeGreaterThan(0);
    });

    it('should create consistent signatures', () => {
      const identity = 'test-user';
      const timestamp = Date.now();
      const nonce = 'test-nonce';

      const sig1 = AuthenticationService.createSignature(identity, timestamp, nonce);
      const sig2 = AuthenticationService.createSignature(identity, timestamp, nonce);

      expect(sig1).toBe(sig2);
    });

    it('should create different signatures for different inputs', () => {
      const timestamp = Date.now();
      const nonce = 'test-nonce';

      const sig1 = AuthenticationService.createSignature('user-a', timestamp, nonce);
      const sig2 = AuthenticationService.createSignature('user-b', timestamp, nonce);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      const service = new AuthenticationService();

      // Should not throw
      expect(() => service.destroy()).not.toThrow();

      service.destroy();
    });
  });
});
