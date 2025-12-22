import { ConfigLoader } from '../../../src/config/ConfigLoader';
import { ConsensusMode } from '../../../src/types';

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConfigLoader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env to a clean state
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('load', () => {
    it('should load configuration from environment variables', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      const config = ConfigLoader.load();

      expect(config.chainEndpoint).toBe('https://chain.example.com');
      expect(config.chainId).toBe('test-chain-1');
      expect(config.llmApiKey).toBe('test-api-key');
      expect(config.mediatorPrivateKey).toBe('test-private-key');
      expect(config.mediatorPublicKey).toBe('test-public-key');
    });

    it('should use default values for optional fields', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('permissionless');
      expect(config.llmProvider).toBe('anthropic');
      expect(config.llmModel).toBe('claude-3-5-sonnet-20241022');
      expect(config.facilitationFeePercent).toBe(1.0);
      expect(config.vectorDbPath).toBe('./vector-db');
      expect(config.vectorDimensions).toBe(1536);
      expect(config.maxIntentsCache).toBe(10000);
      expect(config.acceptanceWindowHours).toBe(72);
      expect(config.logLevel).toBe('info');
    });

    it('should throw error for missing required CHAIN_ENDPOINT', () => {
      delete process.env.CHAIN_ENDPOINT;
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      expect(() => ConfigLoader.load()).toThrow('Required environment variable CHAIN_ENDPOINT is not set');
    });

    it('should throw error for missing required CHAIN_ID', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      delete process.env.CHAIN_ID;
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      expect(() => ConfigLoader.load()).toThrow('Required environment variable CHAIN_ID is not set');
    });

    it('should throw error for missing required MEDIATOR_PRIVATE_KEY', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      delete process.env.MEDIATOR_PRIVATE_KEY;
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      expect(() => ConfigLoader.load()).toThrow('Required environment variable MEDIATOR_PRIVATE_KEY is not set');
    });

    it('should throw error for missing required MEDIATOR_PUBLIC_KEY', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      delete process.env.MEDIATOR_PUBLIC_KEY;

      expect(() => ConfigLoader.load()).toThrow('Required environment variable MEDIATOR_PUBLIC_KEY is not set');
    });

    it('should require ANTHROPIC_API_KEY when llmProvider is anthropic', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.LLM_PROVIDER = 'anthropic';
      delete process.env.ANTHROPIC_API_KEY;
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      expect(() => ConfigLoader.load()).toThrow('Required environment variable ANTHROPIC_API_KEY is not set');
    });

    it('should require OPENAI_API_KEY when llmProvider is openai', () => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.LLM_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';

      expect(() => ConfigLoader.load()).toThrow('Required environment variable OPENAI_API_KEY is not set');
    });
  });

  describe('consensusMode', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should load permissionless consensus mode', () => {
      process.env.CONSENSUS_MODE = 'permissionless';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('permissionless');
    });

    it('should load dpos consensus mode', () => {
      process.env.CONSENSUS_MODE = 'dpos';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('dpos');
    });

    it('should load poa consensus mode', () => {
      process.env.CONSENSUS_MODE = 'poa';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('poa');
    });

    it('should load hybrid consensus mode', () => {
      process.env.CONSENSUS_MODE = 'hybrid';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('hybrid');
    });

    it('should throw error for invalid consensus mode', () => {
      process.env.CONSENSUS_MODE = 'invalid';

      expect(() => ConfigLoader.load()).toThrow('Invalid consensus mode: invalid');
    });

    it('should default to permissionless when not specified', () => {
      delete process.env.CONSENSUS_MODE;

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('permissionless');
    });
  });

  describe('llmProvider', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should load anthropic provider', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const config = ConfigLoader.load();

      expect(config.llmProvider).toBe('anthropic');
    });

    it('should load openai provider', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';

      const config = ConfigLoader.load();

      expect(config.llmProvider).toBe('openai');
    });

    it('should load custom provider', () => {
      process.env.LLM_PROVIDER = 'custom';
      process.env.OPENAI_API_KEY = 'test-key'; // Custom provider requires OPENAI_API_KEY

      const config = ConfigLoader.load();

      expect(config.llmProvider).toBe('custom');
    });

    it('should throw error for invalid LLM provider', () => {
      process.env.LLM_PROVIDER = 'invalid';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      expect(() => ConfigLoader.load()).toThrow('Invalid LLM provider: invalid');
    });

    it('should default to anthropic when not specified', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const config = ConfigLoader.load();

      expect(config.llmProvider).toBe('anthropic');
    });
  });

  describe('logLevel', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should load debug log level', () => {
      process.env.LOG_LEVEL = 'debug';

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('debug');
    });

    it('should load info log level', () => {
      process.env.LOG_LEVEL = 'info';

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('info');
    });

    it('should load warn log level', () => {
      process.env.LOG_LEVEL = 'warn';

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('warn');
    });

    it('should load error log level', () => {
      process.env.LOG_LEVEL = 'error';

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('error');
    });

    it('should default to info for invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid';

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('info');
    });

    it('should default to info when not specified', () => {
      delete process.env.LOG_LEVEL;

      const config = ConfigLoader.load();

      expect(config.logLevel).toBe('info');
    });
  });

  describe('optional numeric fields', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should parse BONDED_STAKE_AMOUNT as number', () => {
      process.env.BONDED_STAKE_AMOUNT = '5000';

      const config = ConfigLoader.load();

      expect(config.bondedStakeAmount).toBe(5000);
    });

    it('should parse MIN_EFFECTIVE_STAKE as number', () => {
      process.env.MIN_EFFECTIVE_STAKE = '1000';

      const config = ConfigLoader.load();

      expect(config.minEffectiveStake).toBe(1000);
    });

    it('should parse FACILITATION_FEE_PERCENT as float', () => {
      process.env.FACILITATION_FEE_PERCENT = '2.5';

      const config = ConfigLoader.load();

      expect(config.facilitationFeePercent).toBe(2.5);
    });

    it('should parse VECTOR_DIMENSIONS as integer', () => {
      process.env.VECTOR_DIMENSIONS = '768';

      const config = ConfigLoader.load();

      expect(config.vectorDimensions).toBe(768);
    });

    it('should parse MAX_INTENTS_CACHE as integer', () => {
      process.env.MAX_INTENTS_CACHE = '5000';

      const config = ConfigLoader.load();

      expect(config.maxIntentsCache).toBe(5000);
    });

    it('should parse ACCEPTANCE_WINDOW_HOURS as integer', () => {
      process.env.ACCEPTANCE_WINDOW_HOURS = '48';

      const config = ConfigLoader.load();

      expect(config.acceptanceWindowHours).toBe(48);
    });

    it('should handle decimal values for BONDED_STAKE_AMOUNT', () => {
      process.env.BONDED_STAKE_AMOUNT = '5000.75';

      const config = ConfigLoader.load();

      expect(config.bondedStakeAmount).toBe(5000.75);
    });

    it('should leave optional number fields undefined when not set', () => {
      const config = ConfigLoader.load();

      expect(config.bondedStakeAmount).toBeUndefined();
      expect(config.minEffectiveStake).toBeUndefined();
    });
  });

  describe('optional string fields', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should load POA_AUTHORITY_KEY when provided', () => {
      process.env.POA_AUTHORITY_KEY = 'authority-key-123';

      const config = ConfigLoader.load();

      expect(config.poaAuthorityKey).toBe('authority-key-123');
    });

    it('should load REPUTATION_CHAIN_ENDPOINT when provided', () => {
      process.env.REPUTATION_CHAIN_ENDPOINT = 'https://reputation.example.com';

      const config = ConfigLoader.load();

      expect(config.reputationChainEndpoint).toBe('https://reputation.example.com');
    });

    it('should load VECTOR_DB_PATH when provided', () => {
      process.env.VECTOR_DB_PATH = '/custom/vector/path';

      const config = ConfigLoader.load();

      expect(config.vectorDbPath).toBe('/custom/vector/path');
    });

    it('should load LLM_MODEL when provided', () => {
      process.env.LLM_MODEL = 'claude-3-opus-20240229';

      const config = ConfigLoader.load();

      expect(config.llmModel).toBe('claude-3-opus-20240229');
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should throw error for negative facilitation fee', () => {
      process.env.FACILITATION_FEE_PERCENT = '-1';

      expect(() => ConfigLoader.load()).toThrow('Facilitation fee must be between 0 and 100');
    });

    it('should throw error for facilitation fee over 100', () => {
      process.env.FACILITATION_FEE_PERCENT = '101';

      expect(() => ConfigLoader.load()).toThrow('Facilitation fee must be between 0 and 100');
    });

    it('should allow facilitation fee of 0', () => {
      process.env.FACILITATION_FEE_PERCENT = '0';

      const config = ConfigLoader.load();

      expect(config.facilitationFeePercent).toBe(0);
    });

    it('should allow facilitation fee of 100', () => {
      process.env.FACILITATION_FEE_PERCENT = '100';

      const config = ConfigLoader.load();

      expect(config.facilitationFeePercent).toBe(100);
    });

    it('should throw error for zero vector dimensions', () => {
      process.env.VECTOR_DIMENSIONS = '0';

      expect(() => ConfigLoader.load()).toThrow('Vector dimensions must be positive');
    });

    it('should throw error for negative vector dimensions', () => {
      process.env.VECTOR_DIMENSIONS = '-100';

      expect(() => ConfigLoader.load()).toThrow('Vector dimensions must be positive');
    });

    it('should allow positive vector dimensions', () => {
      process.env.VECTOR_DIMENSIONS = '512';

      const config = ConfigLoader.load();

      expect(config.vectorDimensions).toBe(512);
    });
  });

  describe('DPoS mode validation', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should warn when DPoS mode without MIN_EFFECTIVE_STAKE', () => {
      process.env.CONSENSUS_MODE = 'dpos';
      delete process.env.MIN_EFFECTIVE_STAKE;

      // Should not throw, just warn
      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('dpos');
      expect(config.minEffectiveStake).toBeUndefined();
    });

    it('should accept DPoS mode with MIN_EFFECTIVE_STAKE', () => {
      process.env.CONSENSUS_MODE = 'dpos';
      process.env.MIN_EFFECTIVE_STAKE = '1000';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('dpos');
      expect(config.minEffectiveStake).toBe(1000);
    });

    it('should warn when Hybrid mode without MIN_EFFECTIVE_STAKE', () => {
      process.env.CONSENSUS_MODE = 'hybrid';
      delete process.env.MIN_EFFECTIVE_STAKE;

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('hybrid');
      expect(config.minEffectiveStake).toBeUndefined();
    });
  });

  describe('PoA mode validation', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should warn when PoA mode without POA_AUTHORITY_KEY', () => {
      process.env.CONSENSUS_MODE = 'poa';
      delete process.env.POA_AUTHORITY_KEY;

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('poa');
      expect(config.poaAuthorityKey).toBeUndefined();
    });

    it('should accept PoA mode with POA_AUTHORITY_KEY', () => {
      process.env.CONSENSUS_MODE = 'poa';
      process.env.POA_AUTHORITY_KEY = 'authority-key-123';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('poa');
      expect(config.poaAuthorityKey).toBe('authority-key-123');
    });

    it('should warn when Hybrid mode without POA_AUTHORITY_KEY', () => {
      process.env.CONSENSUS_MODE = 'hybrid';
      delete process.env.POA_AUTHORITY_KEY;

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('hybrid');
      expect(config.poaAuthorityKey).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env.CHAIN_ENDPOINT = 'https://chain.example.com';
      process.env.CHAIN_ID = 'test-chain-1';
      process.env.ANTHROPIC_API_KEY = 'test-api-key';
      process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
      process.env.MEDIATOR_PUBLIC_KEY = 'test-public-key';
    });

    it('should use default when environment variable is empty string', () => {
      process.env.VECTOR_DB_PATH = '';

      const config = ConfigLoader.load();

      // Empty strings fall back to default value
      expect(config.vectorDbPath).toBe('./vector-db');
    });

    it('should handle whitespace in environment variables', () => {
      process.env.CHAIN_ID = '  test-chain-1  ';

      const config = ConfigLoader.load();

      expect(config.chainId).toBe('  test-chain-1  ');
    });

    it('should handle very large numbers', () => {
      process.env.MAX_INTENTS_CACHE = '999999999';

      const config = ConfigLoader.load();

      expect(config.maxIntentsCache).toBe(999999999);
    });

    it('should handle all consensus modes with full configuration', () => {
      process.env.CONSENSUS_MODE = 'hybrid';
      process.env.BONDED_STAKE_AMOUNT = '5000';
      process.env.MIN_EFFECTIVE_STAKE = '1000';
      process.env.POA_AUTHORITY_KEY = 'authority-key';

      const config = ConfigLoader.load();

      expect(config.consensusMode).toBe('hybrid');
      expect(config.bondedStakeAmount).toBe(5000);
      expect(config.minEffectiveStake).toBe(1000);
      expect(config.poaAuthorityKey).toBe('authority-key');
    });
  });
});
