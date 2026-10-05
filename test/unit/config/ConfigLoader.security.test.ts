/**
 * Security-focused unit tests for ConfigLoader
 *
 * Covers:
 * - Production guards: placeholder credentials rejected, plain-HTTP chain endpoints
 *   rejected (localhost / 127.0.0.1 exempt); non-production is permissive
 * - Security limit env vars (LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CALLS_PER_DAY,
 *   MAX_INTENTS_PER_AUTHOR_PER_HOUR): parsing and positive-number validation
 * - Embedding provider parsing and warnings, .env path handling
 */

import * as dotenv from 'dotenv';
import { ConfigLoader } from '../../../src/config/ConfigLoader';
import { logger } from '../../../src/utils/logger';

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

/** Every variable ConfigLoader reads, cleared so the host environment cannot leak in. */
const CONFIG_KEYS = [
  'CHAIN_ENDPOINT', 'CHAIN_ID', 'CONSENSUS_MODE', 'LLM_PROVIDER', 'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY', 'LLM_MODEL', 'MEDIATOR_PRIVATE_KEY', 'MEDIATOR_PUBLIC_KEY',
  'FACILITATION_FEE_PERCENT', 'BONDED_STAKE_AMOUNT', 'MIN_EFFECTIVE_STAKE', 'POA_AUTHORITY_KEY',
  'VECTOR_DB_PATH', 'VECTOR_DIMENSIONS', 'MAX_INTENTS_CACHE', 'REPUTATION_CHAIN_ENDPOINT',
  'ACCEPTANCE_WINDOW_HOURS', 'EMBEDDING_PROVIDER', 'EMBEDDING_API_KEY', 'EMBEDDING_MODEL',
  'MIN_NEGOTIATION_CONFIDENCE', 'MAX_INTENT_FLAGS', 'MIN_INTENT_PROSE_LENGTH',
  'ENABLE_CHALLENGE_SUBMISSION', 'MIN_CONFIDENCE_TO_CHALLENGE', 'CHALLENGE_CHECK_INTERVAL',
  'ALIGNMENT_CYCLE_INTERVAL_MS', 'INTENT_POLLING_INTERVAL_MS', 'SETTLEMENT_MONITORING_INTERVAL_MS',
  'HEALTH_SERVER_PORT', 'LLM_MAX_CALLS_PER_HOUR', 'LLM_MAX_CALLS_PER_DAY',
  'MAX_INTENTS_PER_AUTHOR_PER_HOUR', 'LOG_LEVEL',
];

/** A configuration that is valid even in production. */
const BASE_ENV: Record<string, string> = {
  CHAIN_ENDPOINT: 'https://chain.example.com',
  CHAIN_ID: 'natlang-mainnet',
  ANTHROPIC_API_KEY: 'anthropic-real-credential-0123456789',
  MEDIATOR_PRIVATE_KEY: 'mediator-private-key-material-xyz',
  MEDIATOR_PUBLIC_KEY: 'mediator-public-key-material-xyz',
  EMBEDDING_PROVIDER: 'openai',
  EMBEDDING_API_KEY: 'embedding-real-credential-0123456789',
};

function warnedWith(fragment: string): boolean {
  return mockedLogger.warn.mock.calls.some(([msg]) => String(msg).includes(fragment));
}

describe('ConfigLoader security', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    const env: NodeJS.ProcessEnv = { ...ORIGINAL_ENV };
    for (const key of CONFIG_KEYS) delete env[key];
    process.env = { ...env, ...BASE_ENV, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('production guards', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('loads a production config with real-looking credentials and HTTPS endpoints', () => {
      process.env.REPUTATION_CHAIN_ENDPOINT = 'https://reputation.example.com';

      const config = ConfigLoader.load();

      expect(config.chainEndpoint).toBe('https://chain.example.com');
      expect(config.reputationChainEndpoint).toBe('https://reputation.example.com');
    });

    it.each([
      ['ANTHROPIC_API_KEY', 'your-api-key-here'],
      ['ANTHROPIC_API_KEY', 'test-api-key'],
      ['ANTHROPIC_API_KEY', 'test-key'],
      ['MEDIATOR_PRIVATE_KEY', 'demo_private_key_for_testing_only'],
      ['MEDIATOR_PRIVATE_KEY', 'your-private-key-here'],
      ['MEDIATOR_PUBLIC_KEY', 'your-public-key-here'],
      ['POA_AUTHORITY_KEY', 'your-authority-key-here'],
    ])('rejects placeholder %s=%s', (key, value) => {
      process.env[key] = value;

      expect(() => ConfigLoader.load()).toThrow(
        `Production environment detected placeholder key value: "${value}"`
      );
    });

    it('rejects a placeholder OpenAI key when the OpenAI provider is selected', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'your-openai-key-here';

      expect(() => ConfigLoader.load()).toThrow('placeholder key value: "your-openai-key-here"');
    });

    it.each([
      ['CHAIN_ENDPOINT', 'http://chain.example.com'],
      ['CHAIN_ENDPOINT', 'http://10.0.0.5:8545'],
      ['CHAIN_ENDPOINT', 'HTTP://CHAIN.EXAMPLE.COM'],
      ['CHAIN_ENDPOINT', 'http://localhost.attacker.example'],
      ['REPUTATION_CHAIN_ENDPOINT', 'http://reputation.example.com'],
    ])('rejects plain-HTTP %s=%s', (key, value) => {
      process.env[key] = value;

      expect(() => ConfigLoader.load()).toThrow('Production environment requires HTTPS for chain endpoints');
    });

    it.each([
      ['https://chain.example.com:8443/api'],
      ['http://localhost:8545'],
      ['http://127.0.0.1:3000'],
    ])('allows CHAIN_ENDPOINT=%s', endpoint => {
      process.env.CHAIN_ENDPOINT = endpoint;
      process.env.REPUTATION_CHAIN_ENDPOINT = 'http://localhost:9000';

      expect(ConfigLoader.load().chainEndpoint).toBe(endpoint);
    });

    it('does not report a non-URL endpoint as an HTTPS violation (left to URL parsing downstream)', () => {
      process.env.REPUTATION_CHAIN_ENDPOINT = 'not a url';

      expect(ConfigLoader.load().reputationChainEndpoint).toBe('not a url');
    });
  });

  describe('non-production environments', () => {
    it.each(['test', 'development', undefined])('NODE_ENV=%s allows placeholder keys and plain HTTP', nodeEnv => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;

      process.env.ANTHROPIC_API_KEY = 'your-api-key-here';
      process.env.MEDIATOR_PRIVATE_KEY = 'demo_private_key_for_testing_only';
      process.env.MEDIATOR_PUBLIC_KEY = 'your-public-key-here';
      process.env.POA_AUTHORITY_KEY = 'your-authority-key-here';
      process.env.CHAIN_ENDPOINT = 'http://chain.example.com';
      process.env.REPUTATION_CHAIN_ENDPOINT = 'http://reputation.example.com';

      const config = ConfigLoader.load();

      expect(config.llmApiKey).toBe('your-api-key-here');
      expect(config.mediatorPrivateKey).toBe('demo_private_key_for_testing_only');
      expect(config.chainEndpoint).toBe('http://chain.example.com');
      expect(config.reputationChainEndpoint).toBe('http://reputation.example.com');
    });
  });

  describe('security limit env vars', () => {
    it('loads the limits into config', () => {
      process.env.LLM_MAX_CALLS_PER_HOUR = '50';
      process.env.LLM_MAX_CALLS_PER_DAY = '200';
      process.env.MAX_INTENTS_PER_AUTHOR_PER_HOUR = '5';

      const config = ConfigLoader.load();

      expect(config.llmMaxCallsPerHour).toBe(50);
      expect(config.llmMaxCallsPerDay).toBe(200);
      expect(config.maxIntentsPerAuthorPerHour).toBe(5);
    });

    it('leaves the limits undefined when unset or empty (consumers apply their defaults)', () => {
      process.env.LLM_MAX_CALLS_PER_DAY = '';

      const config = ConfigLoader.load();

      expect(config.llmMaxCallsPerHour).toBeUndefined();
      expect(config.llmMaxCallsPerDay).toBeUndefined();
      expect(config.maxIntentsPerAuthorPerHour).toBeUndefined();
    });

    const LIMITS = ['LLM_MAX_CALLS_PER_HOUR', 'LLM_MAX_CALLS_PER_DAY', 'MAX_INTENTS_PER_AUTHOR_PER_HOUR'];
    const BAD_VALUES = ['abc', '0', '-5', 'NaN', '-0.5'];

    it.each(LIMITS.flatMap(name => BAD_VALUES.map(value => [name, value])))(
      'rejects %s=%s',
      (name, value) => {
        process.env[name] = value;

        expect(() => ConfigLoader.load()).toThrow(`${name} must be a positive number`);
      }
    );
  });

  describe('embedding provider', () => {
    it.each(['openai', 'voyage', 'cohere', 'fallback'])('accepts EMBEDDING_PROVIDER=%s', provider => {
      process.env.EMBEDDING_PROVIDER = provider;

      expect(ConfigLoader.load().embeddingProvider).toBe(provider);
    });

    it('rejects an unknown embedding provider', () => {
      process.env.EMBEDDING_PROVIDER = 'word2vec';

      expect(() => ConfigLoader.load()).toThrow(
        'Invalid embedding provider: word2vec. Valid options: openai, voyage, cohere, fallback'
      );
    });

    it('warns when an Anthropic deployment selects an embedding provider but no embedding key', () => {
      process.env.EMBEDDING_PROVIDER = 'voyage';
      delete process.env.EMBEDDING_API_KEY;

      const config = ConfigLoader.load();

      expect(config.embeddingApiKey).toBeUndefined();
      expect(warnedWith('EMBEDDING_PROVIDER=voyage but EMBEDDING_API_KEY not set')).toBe(true);
    });

    it('does not warn when the embedding provider and key are both set', () => {
      const config = ConfigLoader.load();

      expect(config.embeddingApiKey).toBe(BASE_ENV.EMBEDDING_API_KEY);
      expect(warnedWith('EMBEDDING_API_KEY not set')).toBe(false);
      expect(warnedWith('Anthropic does not provide embeddings')).toBe(false);
    });

    it.each([['unset', undefined], ['fallback', 'fallback']])(
      'warns about fallback embeddings for Anthropic when the provider is %s',
      (_label, provider) => {
        if (provider === undefined) delete process.env.EMBEDDING_PROVIDER;
        else process.env.EMBEDDING_PROVIDER = provider;

        ConfigLoader.load();

        expect(warnedWith('Anthropic does not provide embeddings')).toBe(true);
      }
    );

    it('does not apply the Anthropic embedding warnings to OpenAI deployments', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'openai-real-credential-0123456789';
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.EMBEDDING_API_KEY;

      const config = ConfigLoader.load();

      expect(config.llmApiKey).toBe('openai-real-credential-0123456789');
      expect(mockedLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('.env loading', () => {
    it('loads the given env file path', () => {
      ConfigLoader.load('/etc/mediator/.env.production');

      expect(dotenv.config).toHaveBeenCalledWith({ path: '/etc/mediator/.env.production' });
    });

    it('loads the default .env when no path is given', () => {
      ConfigLoader.load();

      expect(dotenv.config).toHaveBeenCalledWith();
    });
  });
});
