import { scanForSecrets, redactSecrets, assertNoSecrets } from '../../../src/utils/secret-scanner';

describe('SecretScanner', () => {
  describe('scanForSecrets', () => {
    it('should detect OpenAI API keys', () => {
      const text = 'Config: sk-abcdefghijklmnopqrstuvwxyz12345';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches[0].label).toBe('OpenAI/Anthropic API key');
    });

    it('should detect Bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches.some(m => m.label === 'Bearer token')).toBe(true);
    });

    it('should detect PEM private keys', () => {
      const text = '-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBg...\n-----END PRIVATE KEY-----';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches[0].label).toBe('PEM private key');
    });

    it('should detect email addresses', () => {
      const text = 'Contact: user@example.com for details';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches.some(m => m.label === 'Email address')).toBe(true);
    });

    it('should detect AWS access keys', () => {
      const text = 'aws_key=AKIAIOSFODNN7EXAMPLE';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches.some(m => m.label === 'AWS access key')).toBe(true);
    });

    it('should detect inline secret assignments', () => {
      const text = 'api_key: "abcdefghijklmnopqrstuvwxyz"';
      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.matches.some(m => m.label === 'Inline secret assignment')).toBe(true);
    });

    it('should detect config value literal matches', () => {
      const text = 'Here is some data with my-very-long-secret-api-key-value in it';
      const result = scanForSecrets(text, ['my-very-long-secret-api-key-value']);
      expect(result.found).toBe(true);
      expect(result.matches.some(m => m.label === 'Config value literal match')).toBe(true);
    });

    it('should not flag normal intent prose', () => {
      const text = 'I want to buy 100 widgets at $5 each, delivered within 2 weeks to my warehouse.';
      const result = scanForSecrets(text);
      expect(result.found).toBe(false);
    });

    it('should not flag short config values', () => {
      const text = 'Some text with short value in it';
      const result = scanForSecrets(text, ['short']);
      expect(result.found).toBe(false);
    });
  });

  describe('redactSecrets', () => {
    it('should replace API keys with [REDACTED]', () => {
      const text = 'Using key sk-abcdefghijklmnopqrstuvwxyz12345 for auth';
      const result = redactSecrets(text);
      expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345');
      expect(result).toContain('[REDACTED]');
    });

    it('should replace PEM blocks with [REDACTED]', () => {
      const text = 'Key: -----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----';
      const result = redactSecrets(text);
      expect(result).not.toContain('BEGIN PRIVATE KEY');
      expect(result).toContain('[REDACTED]');
    });

    it('should not modify text without secrets', () => {
      const text = 'Normal text without any secrets';
      const result = redactSecrets(text);
      expect(result).toBe(text);
    });
  });

  describe('assertNoSecrets', () => {
    it('should not throw for clean text', () => {
      expect(() => {
        assertNoSecrets('Normal text', 'test context');
      }).not.toThrow();
    });

    it('should throw when secrets are detected', () => {
      expect(() => {
        assertNoSecrets('Key: sk-abcdefghijklmnopqrstuvwxyz12345', 'test context');
      }).toThrow('Outbound secret scan failed');
    });

    it('should throw when config values are found', () => {
      expect(() => {
        assertNoSecrets(
          'Sending data with my-super-secret-api-key-12345',
          'test context',
          ['my-super-secret-api-key-12345']
        );
      }).toThrow('Outbound secret scan failed');
    });
  });
});
