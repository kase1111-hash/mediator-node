import nodeCrypto from 'crypto';
import {
  calculateReputationWeight,
  calculateStakeWeight,
  generateIntentHash,
  generateKeyPair,
  generateModelIntegrityHash,
  generateSignature,
  verifySignature,
} from '../../../src/utils/crypto';

/** Flip the first byte of a base64 signature, keeping its length. */
function tamperSignature(signature: string): string {
  const bytes = Buffer.from(signature, 'base64');
  bytes[0] ^= 0xff;
  return bytes.toString('base64');
}

describe('crypto utils', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('generateIntentHash', () => {
    const prose = 'I want to buy 100 widgets';
    const author = 'alice';
    const timestamp = 1700000000000;

    it('is deterministic for the same inputs', () => {
      const first = generateIntentHash(prose, author, timestamp);
      const second = generateIntentHash(prose, author, timestamp);
      const third = generateIntentHash(prose, author, timestamp);

      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it('produces a stable, well-known SHA-256 identity', () => {
      // Identity must not change across releases: it keys the intent cache,
      // the persisted vector index and settlements.
      expect(generateIntentHash(prose, author, timestamp)).toBe(
        'afad5a87bc920d0586b27e9cf9666361c1da0f7783648cc09250ba7d37893ade'
      );
    });

    it('is stable across independently loaded module instances (e.g. restarts or other nodes)', () => {
      let isolatedHash = '';
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolated = require('../../../src/utils/crypto') as typeof import('../../../src/utils/crypto');
        isolatedHash = isolated.generateIntentHash(prose, author, timestamp);
      });

      expect(isolatedHash).toBe(generateIntentHash(prose, author, timestamp));
    });

    it('returns a 64-character lowercase hex digest', () => {
      expect(generateIntentHash(prose, author, timestamp)).toMatch(/^[0-9a-f]{64}$/);
    });

    it.each([
      ['prose', 'I want to buy 101 widgets', author, timestamp],
      ['author', prose, 'bob', timestamp],
      ['timestamp', prose, author, timestamp + 1],
    ])('changes when the %s changes', (_field, p, a, t) => {
      expect(generateIntentHash(p as string, a as string, t as number)).not.toBe(
        generateIntentHash(prose, author, timestamp)
      );
    });
  });

  describe('generateModelIntegrityHash', () => {
    it('is deterministic and hex encoded', () => {
      const hash = generateModelIntegrityHash('claude-3', 'Match {a} with {b}', '2.1');

      expect(hash).toBe(generateModelIntegrityHash('claude-3', 'Match {a} with {b}', '2.1'));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('defaults the version to 1.0', () => {
      expect(generateModelIntegrityHash('claude-3', 'prompt')).toBe(
        generateModelIntegrityHash('claude-3', 'prompt', '1.0')
      );
    });

    it('changes when the model, prompt template or version changes', () => {
      const base = generateModelIntegrityHash('claude-3', 'prompt', '1.0');

      expect(generateModelIntegrityHash('gpt-4', 'prompt', '1.0')).not.toBe(base);
      expect(generateModelIntegrityHash('claude-3', 'prompt v2', '1.0')).not.toBe(base);
      expect(generateModelIntegrityHash('claude-3', 'prompt', '1.1')).not.toBe(base);
    });
  });

  describe('PEM signatures', () => {
    // generateKeyPair() is the module's own dev key generator (RSA-3072, spki/pkcs8).
    let keys: { privateKey: string; publicKey: string };
    // A second, unrelated key pair in PKCS#1 ("BEGIN RSA ... KEY") encoding.
    let otherKeys: { privateKey: string; publicKey: string };

    beforeAll(() => {
      keys = generateKeyPair();
      otherKeys = nodeCrypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      });
    });

    describe('generateKeyPair', () => {
      it('returns a 3072-bit RSA key pair in PEM (spki / pkcs8) format', () => {
        expect(keys.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
        expect(keys.privateKey).toContain('-----BEGIN PRIVATE KEY-----');

        const publicKey = nodeCrypto.createPublicKey(keys.publicKey);
        expect(publicKey.asymmetricKeyType).toBe('rsa');
        expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(3072);
      });

      it('produces a matching private/public pair', () => {
        const derived = nodeCrypto
          .createPublicKey(keys.privateKey)
          .export({ type: 'spki', format: 'pem' });

        expect(derived).toBe(keys.publicKey);
      });
    });

    it('round-trips sign and verify', () => {
      const data = JSON.stringify({ settlement: 'abc', fee: 5 });

      const signature = generateSignature(data, keys.privateKey);

      expect(verifySignature(data, signature, keys.publicKey)).toBe(true);
    });

    it('produces a base64 RSA-SHA256 signature verifiable by standard tooling', () => {
      const data = 'hello chain';

      const signature = generateSignature(data, keys.privateKey);
      const raw = Buffer.from(signature, 'base64');

      expect(raw.toString('base64')).toBe(signature);
      expect(raw.length).toBe(3072 / 8);
      expect(nodeCrypto.verify('sha256', Buffer.from(data), keys.publicKey, raw)).toBe(true);
    });

    it('supports PKCS#1 encoded RSA keys', () => {
      const signature = generateSignature('data', otherKeys.privateKey);

      expect(verifySignature('data', signature, otherKeys.publicKey)).toBe(true);
    });

    it('supports EC keys', () => {
      const ec = nodeCrypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const signature = generateSignature('data', ec.privateKey);

      expect(verifySignature('data', signature, ec.publicKey)).toBe(true);
      expect(verifySignature('tampered', signature, ec.publicKey)).toBe(false);
    });

    it('rejects tampered data', () => {
      const signature = generateSignature('pay 10 tokens', keys.privateKey);

      expect(verifySignature('pay 99 tokens', signature, keys.publicKey)).toBe(false);
    });

    it('rejects a tampered signature', () => {
      const signature = generateSignature('pay 10 tokens', keys.privateKey);

      expect(verifySignature('pay 10 tokens', tamperSignature(signature), keys.publicKey)).toBe(false);
    });

    it('rejects a signature made with a different private key', () => {
      const signature = generateSignature('data', otherKeys.privateKey);

      expect(verifySignature('data', signature, keys.publicKey)).toBe(false);
    });

    it('returns false rather than throwing for a garbage signature', () => {
      expect(verifySignature('data', 'not a signature!!', keys.publicKey)).toBe(false);
      expect(verifySignature('data', '', keys.publicKey)).toBe(false);
    });

    it('returns false rather than throwing for a malformed PEM public key', () => {
      const signature = generateSignature('data', keys.privateKey);
      const badPublicKey = '-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----';

      expect(() => verifySignature('data', signature, badPublicKey)).not.toThrow();
      expect(verifySignature('data', signature, badPublicKey)).toBe(false);
    });

    it('wraps errors from a malformed PEM private key', () => {
      const badPrivateKey = '-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----';

      expect(() => generateSignature('data', badPrivateKey)).toThrow(/^Signature generation failed: /);
    });

    it('keeps working with PEM keys in production', () => {
      process.env.NODE_ENV = 'production';

      const signature = generateSignature('data', keys.privateKey);

      expect(verifySignature('data', signature, keys.publicKey)).toBe(true);
    });
  });

  describe('HMAC development fallback (non-PEM keys)', () => {
    const sharedSecret = 'dev-shared-secret';

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('round-trips when the same shared secret is used for signing and verifying', () => {
      const signature = generateSignature('intent prose', sharedSecret);

      expect(verifySignature('intent prose', signature, sharedSecret)).toBe(true);
    });

    it('is also available in the test environment', () => {
      process.env.NODE_ENV = 'test';

      const signature = generateSignature('intent prose', sharedSecret);

      expect(verifySignature('intent prose', signature, sharedSecret)).toBe(true);
    });

    it('produces a base64 HMAC-SHA256 of the data keyed by the secret', () => {
      const expected = nodeCrypto.createHmac('sha256', sharedSecret).update('payload').digest('base64');

      expect(generateSignature('payload', sharedSecret)).toBe(expected);
    });

    it('is deterministic for the same data and secret', () => {
      expect(generateSignature('payload', sharedSecret)).toBe(generateSignature('payload', sharedSecret));
    });

    it('rejects a signature made with a different secret', () => {
      const signature = generateSignature('intent prose', 'some-other-secret');

      expect(verifySignature('intent prose', signature, sharedSecret)).toBe(false);
    });

    it('rejects tampered data', () => {
      const signature = generateSignature('intent prose', sharedSecret);

      expect(verifySignature('intent prose!', signature, sharedSecret)).toBe(false);
    });

    it('rejects a tampered signature of the same length', () => {
      const signature = generateSignature('intent prose', sharedSecret);

      expect(verifySignature('intent prose', tamperSignature(signature), sharedSecret)).toBe(false);
    });

    it('returns false (without throwing) when the signature length differs from the expected MAC', () => {
      const signature = generateSignature('intent prose', sharedSecret);
      const truncated = Buffer.from(signature, 'base64').subarray(0, 16).toString('base64');

      expect(() => verifySignature('intent prose', truncated, sharedSecret)).not.toThrow();
      expect(verifySignature('intent prose', truncated, sharedSecret)).toBe(false);
      expect(verifySignature('intent prose', '', sharedSecret)).toBe(false);
    });
  });

  describe('production mode with non-PEM keys', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('refuses to generate an HMAC signature', () => {
      expect(() => generateSignature('data', 'plain-secret')).toThrow(
        'Signature generation failed: Production environment requires PEM-formatted private keys'
      );
    });

    it('refuses to sign with a PEM public key mistaken for a private key', () => {
      const { publicKey } = nodeCrypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      expect(() => generateSignature('data', publicKey)).toThrow(/requires PEM-formatted private keys/);
    });

    it('rejects HMAC signatures even when they would otherwise match', () => {
      process.env.NODE_ENV = 'development';
      const devSignature = generateSignature('data', 'plain-secret');
      process.env.NODE_ENV = 'production';

      expect(verifySignature('data', devSignature, 'plain-secret')).toBe(false);
    });
  });

  describe('calculateReputationWeight (MP-01)', () => {
    it('applies (successes + failedChallenges * 2) / (1 + upheld + forfeited)', () => {
      expect(calculateReputationWeight(10, 2, 1, 1)).toBeCloseTo(14 / 3);
    });

    it('is zero for a mediator with no history and never divides by zero', () => {
      expect(calculateReputationWeight(0, 0, 0, 0)).toBe(0);
    });

    it('weights failed challenges (successful defences) twice as much as closures', () => {
      expect(calculateReputationWeight(0, 1, 0, 0)).toBe(2);
      expect(calculateReputationWeight(1, 0, 0, 0)).toBe(1);
    });

    it('is reduced by upheld challenges and forfeited fees', () => {
      const clean = calculateReputationWeight(6, 0, 0, 0);

      expect(calculateReputationWeight(6, 0, 2, 0)).toBe(clean / 3);
      expect(calculateReputationWeight(6, 0, 0, 2)).toBe(clean / 3);
    });
  });

  describe('calculateStakeWeight (DPoS)', () => {
    it('applies reputationWeight * ln(1 + effectiveStake)', () => {
      expect(calculateStakeWeight(2, Math.E - 1)).toBeCloseTo(2);
      expect(calculateStakeWeight(1.5, 100)).toBeCloseTo(1.5 * Math.log(101));
    });

    it('is zero with no stake or no reputation', () => {
      expect(calculateStakeWeight(5, 0)).toBe(0);
      expect(calculateStakeWeight(0, 1000)).toBe(0);
    });

    it('grows with stake, but sub-linearly', () => {
      const w10 = calculateStakeWeight(1, 10);
      const w100 = calculateStakeWeight(1, 100);

      expect(w100).toBeGreaterThan(w10);
      expect(w100).toBeLessThan(w10 * 10);
    });
  });
});
