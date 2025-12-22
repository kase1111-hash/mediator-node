import axios from 'axios';
import { AuthorityManager } from '../../../src/consensus/AuthorityManager';
import { MediatorConfig } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock crypto utilities
jest.mock('../../../src/utils/crypto', () => ({
  verifySignature: jest.fn((data: string, signature: string, publicKey: string) => {
    return signature === `valid_sig_${publicKey}`;
  }),
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

describe('AuthorityManager', () => {
  let config: MediatorConfig;
  let authorityManager: AuthorityManager;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createMockConfig({
      mediatorPublicKey: 'mediator_pub_key_123',
      chainEndpoint: 'https://chain.example.com',
      consensusMode: 'poa',
    });
    authorityManager = new AuthorityManager(config);
  });

  describe('constructor', () => {
    it('should initialize with empty authority set', () => {
      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
    });

    it('should initialize as not authorized', () => {
      expect(authorityManager.checkAuthorization()).toBe(false);
    });
  });

  describe('loadAuthoritySet', () => {
    it('should load authority set from chain successfully', async () => {
      const mockAuthorities = [
        'authority_1',
        'authority_2',
        'authority_3',
      ];

      mockAxios.get.mockResolvedValue({
        data: { authorities: mockAuthorities },
      });

      await authorityManager.loadAuthoritySet();

      expect(mockAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/consensus/authorities`
      );

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toHaveLength(3);
      expect(authorities).toContain('authority_1');
      expect(authorities).toContain('authority_2');
      expect(authorities).toContain('authority_3');
    });

    it('should set isAuthorized to true when mediator is in authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: [
            'authority_1',
            config.mediatorPublicKey,
            'authority_2',
          ],
        },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.checkAuthorization()).toBe(true);
    });

    it('should set isAuthorized to false when mediator is not in authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: ['authority_1', 'authority_2'],
        },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.checkAuthorization()).toBe(false);
    });

    it('should handle empty authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: [] },
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
      expect(authorityManager.checkAuthorization()).toBe(false);
    });

    it('should handle missing authorities data', async () => {
      mockAxios.get.mockResolvedValue({});

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
    });

    it('should handle 404 errors gracefully', async () => {
      mockAxios.get.mockRejectedValue({
        response: { status: 404 },
        message: 'Not Found',
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
    });

    it('should deduplicate authorities in the set', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: ['authority_1', 'authority_2', 'authority_1'],
        },
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toHaveLength(2);
    });
  });

  describe('checkAuthorization', () => {
    it('should return false for PoA mode when not authorized', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: ['other_authority'] },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.checkAuthorization()).toBe(false);
    });

    it('should return true for PoA mode when authorized', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: [config.mediatorPublicKey] },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.checkAuthorization()).toBe(true);
    });

    it('should return false for Hybrid mode when not authorized', async () => {
      const hybridConfig = createMockConfig({
        consensusMode: 'hybrid',
      });
      const hybridManager = new AuthorityManager(hybridConfig);

      mockAxios.get.mockResolvedValue({
        data: { authorities: ['other_authority'] },
      });

      await hybridManager.loadAuthoritySet();

      expect(hybridManager.checkAuthorization()).toBe(false);
    });

    it('should return true for Hybrid mode when authorized', async () => {
      const hybridConfig = createMockConfig({
        consensusMode: 'hybrid',
        mediatorPublicKey: 'hybrid_mediator',
      });
      const hybridManager = new AuthorityManager(hybridConfig);

      mockAxios.get.mockResolvedValue({
        data: { authorities: ['hybrid_mediator'] },
      });

      await hybridManager.loadAuthoritySet();

      expect(hybridManager.checkAuthorization()).toBe(true);
    });

    it('should return true for Permissionless mode regardless of authority set', async () => {
      const permissionlessConfig = createMockConfig({
        consensusMode: 'permissionless',
      });
      const permissionlessManager = new AuthorityManager(permissionlessConfig);

      mockAxios.get.mockResolvedValue({
        data: { authorities: ['other_authority'] },
      });

      await permissionlessManager.loadAuthoritySet();

      expect(permissionlessManager.checkAuthorization()).toBe(true);
    });

    it('should return true for DPoS mode regardless of authority set', async () => {
      const dposConfig = createMockConfig({
        consensusMode: 'dpos',
      });
      const dposManager = new AuthorityManager(dposConfig);

      mockAxios.get.mockResolvedValue({
        data: { authorities: ['other_authority'] },
      });

      await dposManager.loadAuthoritySet();

      expect(dposManager.checkAuthorization()).toBe(true);
    });

    it('should return false before loading authority set in PoA mode', () => {
      expect(authorityManager.checkAuthorization()).toBe(false);
    });
  });

  describe('isAuthority', () => {
    it('should return true for public keys in authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: ['authority_1', 'authority_2'],
        },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.isAuthority('authority_1')).toBe(true);
      expect(authorityManager.isAuthority('authority_2')).toBe(true);
    });

    it('should return false for public keys not in authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: ['authority_1', 'authority_2'],
        },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.isAuthority('authority_3')).toBe(false);
      expect(authorityManager.isAuthority('random_key')).toBe(false);
    });

    it('should return false when authority set is empty', () => {
      expect(authorityManager.isAuthority('any_key')).toBe(false);
    });

    it('should handle case sensitivity correctly', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          authorities: ['Authority_1'],
        },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.isAuthority('Authority_1')).toBe(true);
      expect(authorityManager.isAuthority('authority_1')).toBe(false);
    });
  });

  describe('getAuthorities', () => {
    it('should return array of all authorities', async () => {
      const mockAuthorities = ['auth_1', 'auth_2', 'auth_3'];

      mockAxios.get.mockResolvedValue({
        data: { authorities: mockAuthorities },
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual(expect.arrayContaining(mockAuthorities));
      expect(authorities).toHaveLength(3);
    });

    it('should return empty array when no authorities loaded', () => {
      const authorities = authorityManager.getAuthorities();
      expect(authorities).toEqual([]);
    });

    it('should return a new array each time', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: ['auth_1'] },
      });

      await authorityManager.loadAuthoritySet();

      const authorities1 = authorityManager.getAuthorities();
      const authorities2 = authorityManager.getAuthorities();

      expect(authorities1).toEqual(authorities2);
      expect(authorities1).not.toBe(authorities2); // Different array instances
    });
  });

  describe('requestAuthorization', () => {
    it('should submit authorization request successfully', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const result = await authorityManager.requestAuthorization();

      expect(result).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/governance/proposals`,
        expect.objectContaining({
          type: 'authority_add',
          proposerId: config.mediatorPublicKey,
          title: expect.stringContaining(config.mediatorPublicKey),
          description: expect.any(String),
          parameters: {
            publicKey: config.mediatorPublicKey,
          },
          timestamp: expect.any(Number),
        })
      );
    });

    it('should return true on 201 response', async () => {
      mockAxios.post.mockResolvedValue({ status: 201 });

      const result = await authorityManager.requestAuthorization();

      expect(result).toBe(true);
    });

    it('should return false on non-200/201 response', async () => {
      mockAxios.post.mockResolvedValue({ status: 400 });

      const result = await authorityManager.requestAuthorization();

      expect(result).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await authorityManager.requestAuthorization();

      expect(result).toBe(false);
    });

    it('should include correct proposal type', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await authorityManager.requestAuthorization();

      const callArgs = mockAxios.post.mock.calls[0][1] as any;
      expect(callArgs.type).toBe('authority_add');
    });

    it('should include mediator public key in parameters', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await authorityManager.requestAuthorization();

      const callArgs = mockAxios.post.mock.calls[0][1] as any;
      expect(callArgs.parameters.publicKey).toBe(config.mediatorPublicKey);
    });

    it('should handle 500 server errors', async () => {
      mockAxios.post.mockRejectedValue({
        response: { status: 500 },
        message: 'Internal Server Error',
      });

      const result = await authorityManager.requestAuthorization();

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle authority set updates', async () => {
      mockAxios.get
        .mockResolvedValueOnce({
          data: { authorities: ['auth_1', 'auth_2'] },
        })
        .mockResolvedValueOnce({
          data: { authorities: ['auth_1', 'auth_2', 'auth_3'] },
        });

      await authorityManager.loadAuthoritySet();
      expect(authorityManager.getAuthorities()).toHaveLength(2);

      await authorityManager.loadAuthoritySet();
      expect(authorityManager.getAuthorities()).toHaveLength(3);
    });

    it('should handle authority removal', async () => {
      mockAxios.get
        .mockResolvedValueOnce({
          data: { authorities: [config.mediatorPublicKey, 'auth_2'] },
        })
        .mockResolvedValueOnce({
          data: { authorities: ['auth_2'] },
        });

      await authorityManager.loadAuthoritySet();
      expect(authorityManager.checkAuthorization()).toBe(true);

      await authorityManager.loadAuthoritySet();
      expect(authorityManager.checkAuthorization()).toBe(false);
    });

    it('should handle large authority sets', async () => {
      const largeAuthoritySet = Array.from({ length: 1000 }, (_, i) => `authority_${i}`);

      mockAxios.get.mockResolvedValue({
        data: { authorities: largeAuthoritySet },
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toHaveLength(1000);
      expect(authorityManager.isAuthority('authority_500')).toBe(true);
    });

    it('should maintain authorization status across multiple checks', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: [config.mediatorPublicKey] },
      });

      await authorityManager.loadAuthoritySet();

      expect(authorityManager.checkAuthorization()).toBe(true);
      expect(authorityManager.checkAuthorization()).toBe(true);
      expect(authorityManager.checkAuthorization()).toBe(true);
    });

    it('should handle concurrent load attempts', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: ['auth_1', 'auth_2'] },
      });

      const promises = [
        authorityManager.loadAuthoritySet(),
        authorityManager.loadAuthoritySet(),
        authorityManager.loadAuthoritySet(),
      ];

      await Promise.all(promises);

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toHaveLength(2);
    });

    it('should handle empty string in authority set', async () => {
      mockAxios.get.mockResolvedValue({
        data: { authorities: ['auth_1', '', 'auth_2'] },
      });

      await authorityManager.loadAuthoritySet();

      const authorities = authorityManager.getAuthorities();
      expect(authorities).toContain('');
      expect(authorityManager.isAuthority('')).toBe(true);
    });

    it('should preserve consensus mode behavior', async () => {
      const modes: Array<'permissionless' | 'dpos' | 'poa' | 'hybrid'> = [
        'permissionless',
        'dpos',
        'poa',
        'hybrid',
      ];

      for (const mode of modes) {
        const modeConfig = createMockConfig({ consensusMode: mode });
        const modeManager = new AuthorityManager(modeConfig);

        mockAxios.get.mockResolvedValue({
          data: { authorities: ['other_authority'] },
        });

        await modeManager.loadAuthoritySet();

        const isAuthorized = modeManager.checkAuthorization();
        if (mode === 'poa' || mode === 'hybrid') {
          expect(isAuthorized).toBe(false);
        } else {
          expect(isAuthorized).toBe(true);
        }
      }
    });
  });
});
