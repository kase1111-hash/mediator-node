import { EscalationManager } from '../../src/dispute/EscalationManager';
import { MediatorConfig, EscalationAuthorityType } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EscalationManager', () => {
  let escalationManager: EscalationManager;
  let config: MediatorConfig;
  const testDataPath = './test-data/escalations';

  beforeEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }

    config = {
      chainEndpoint: 'http://localhost:3000',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'openai',
      llmApiKey: 'test-key',
      llmModel: 'gpt-4',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 0.01,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 384,
      maxIntentsCache: 1000,
      acceptanceWindowHours: 24,
      logLevel: 'error',
      requireHumanEscalation: true,
      enableDisputeSystem: true,
    } as MediatorConfig;

    escalationManager = new EscalationManager(config, testDataPath);

    // Reset axios mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  describe('Authority Registration', () => {
    it('should register a new authority', () => {
      const result = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Test Arbitrator',
        description: 'A test arbitration authority',
        contactInfo: 'test@example.com',
        jurisdiction: 'US-CA',
        website: 'https://test-arbitrator.com',
      });

      expect(result.success).toBe(true);
      expect(result.authorityId).toBeDefined();

      const authority = escalationManager.getAuthority(result.authorityId!);
      expect(authority).toBeDefined();
      expect(authority?.name).toBe('Test Arbitrator');
      expect(authority?.authorityType).toBe('arbitrator');
      expect(authority?.jurisdiction).toBe('US-CA');
    });

    it('should fail to register authority without name', () => {
      const result = escalationManager.registerAuthority({
        authorityType: 'dao',
        name: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('name is required');
    });

    it('should prevent duplicate authority names', () => {
      escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Duplicate Name',
      });

      const result = escalationManager.registerAuthority({
        authorityType: 'court',
        name: 'Duplicate Name',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should persist authority to disk', () => {
      const result = escalationManager.registerAuthority({
        authorityType: 'review_board',
        name: 'Persistent Authority',
      });

      expect(result.success).toBe(true);

      const authoritiesDir = path.join(testDataPath, 'authorities');
      const filePath = path.join(authoritiesDir, `${result.authorityId}.json`);

      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const savedAuthority = JSON.parse(fileContent);

      expect(savedAuthority.authorityId).toBe(result.authorityId);
      expect(savedAuthority.name).toBe('Persistent Authority');
    });
  });

  describe('Authority Management', () => {
    it('should get all authorities', () => {
      escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Authority 1',
      });

      escalationManager.registerAuthority({
        authorityType: 'dao',
        name: 'Authority 2',
      });

      const authorities = escalationManager.getAllAuthorities();
      expect(authorities).toHaveLength(2);
    });

    it('should get authorities by type', () => {
      escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Arbitrator 1',
      });

      escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Arbitrator 2',
      });

      escalationManager.registerAuthority({
        authorityType: 'dao',
        name: 'DAO 1',
      });

      const arbitrators = escalationManager.getAuthoritiesByType('arbitrator');
      expect(arbitrators).toHaveLength(2);
      expect(arbitrators.every((a) => a.authorityType === 'arbitrator')).toBe(
        true
      );

      const daos = escalationManager.getAuthoritiesByType('dao');
      expect(daos).toHaveLength(1);
    });

    it('should update authority information', () => {
      const result = escalationManager.registerAuthority({
        authorityType: 'court',
        name: 'Original Name',
        jurisdiction: 'US-NY',
      });

      const updated = escalationManager.updateAuthority(result.authorityId!, {
        name: 'Updated Name',
        jurisdiction: 'US-CA',
        website: 'https://updated.com',
      });

      expect(updated).toBe(true);

      const authority = escalationManager.getAuthority(result.authorityId!);
      expect(authority?.name).toBe('Updated Name');
      expect(authority?.jurisdiction).toBe('US-CA');
      expect(authority?.website).toBe('https://updated.com');
    });

    it('should fail to update non-existent authority', () => {
      const updated = escalationManager.updateAuthority('non-existent-id', {
        name: 'New Name',
      });

      expect(updated).toBe(false);
    });

    it('should remove authority without escalations', () => {
      const result = escalationManager.registerAuthority({
        authorityType: 'custom',
        name: 'To Be Removed',
      });

      const removed = escalationManager.removeAuthority(result.authorityId!);
      expect(removed).toBe(true);

      const authority = escalationManager.getAuthority(result.authorityId!);
      expect(authority).toBeUndefined();
    });

    it('should not remove authority with existing escalations', async () => {
      const authResult = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Active Authority',
      });

      await escalationManager.initiateEscalation({
        disputeId: 'dispute-123',
        escalatedBy: 'party-1',
        targetAuthorityId: authResult.authorityId!,
        scopeOfIssues: ['Issue 1'],
      });

      const removed = escalationManager.removeAuthority(authResult.authorityId!);
      expect(removed).toBe(false);
    });
  });

  describe('Escalation Initiation', () => {
    let authorityId: string;

    beforeEach(() => {
      const result = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Test Arbitrator',
        contactInfo: 'https://api.arbitrator.com/escalations',
      });
      authorityId = result.authorityId!;
    });

    it('should initiate an escalation', async () => {
      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue A', 'Issue B'],
        signature: 'sig-123',
        packageId: 'package-1',
      });

      expect(result.success).toBe(true);
      expect(result.escalationId).toBeDefined();

      const escalation = escalationManager.getEscalation(result.escalationId!);
      expect(escalation).toBeDefined();
      expect(escalation?.disputeId).toBe('dispute-1');
      expect(escalation?.escalatedBy).toBe('party-1');
      expect(escalation?.scopeOfIssues).toHaveLength(2);
      expect(escalation?.humanAuthorship).toBe(true);
      expect(escalation?.signature).toBe('sig-123');
    });

    it('should fail with empty scope of issues', async () => {
      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Scope of issues cannot be empty');
    });

    it('should fail with non-existent authority', async () => {
      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-1',
        targetAuthorityId: 'non-existent-authority',
        scopeOfIssues: ['Issue A'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Target authority not found');
    });

    it('should prevent duplicate escalations to same authority', async () => {
      await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue A'],
      });

      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-2',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue B'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Escalation to this authority already exists');
    });

    it('should set humanAuthorship to false without signature', async () => {
      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-2',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue A'],
      });

      expect(result.success).toBe(true);

      const escalation = escalationManager.getEscalation(result.escalationId!);
      expect(escalation?.humanAuthorship).toBe(false);
    });

    it('should persist escalation to disk', async () => {
      const result = await escalationManager.initiateEscalation({
        disputeId: 'dispute-3',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue A'],
      });

      expect(result.success).toBe(true);

      const filePath = path.join(testDataPath, `${result.escalationId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const savedEscalation = JSON.parse(fileContent);

      expect(savedEscalation.escalationId).toBe(result.escalationId);
      expect(savedEscalation.disputeId).toBe('dispute-3');
    });
  });

  describe('Escalation Submission', () => {
    let authorityId: string;
    let escalationId: string;

    beforeEach(async () => {
      const authResult = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'HTTP Authority',
        contactInfo: 'https://api.arbitrator.com/escalations',
      });
      authorityId = authResult.authorityId!;

      const escalationResult = await escalationManager.initiateEscalation({
        disputeId: 'dispute-submit-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Payment dispute', 'Quality issues'],
        signature: 'sig-abc',
      });
      escalationId = escalationResult.escalationId!;
    });

    it('should successfully submit escalation via HTTP', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          confirmationId: 'conf-123',
        },
      });

      const result = await escalationManager.submitEscalation(escalationId);

      expect(result.submitted).toBe(true);
      expect(result.confirmationId).toBe('conf-123');
      expect(result.error).toBeUndefined();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.arbitrator.com/escalations',
        expect.any(String),
        expect.objectContaining({
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle HTTP submission failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await escalationManager.submitEscalation(escalationId);

      expect(result.submitted).toBe(false);
      expect(result.error).toContain('Submission to authority failed');
    });

    it('should fail to submit non-existent escalation', async () => {
      const result = await escalationManager.submitEscalation('non-existent-id');

      expect(result.submitted).toBe(false);
      expect(result.error).toContain('Escalation not found');
    });

    it('should prevent duplicate submissions', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { confirmationId: 'conf-1' },
      });

      await escalationManager.submitEscalation(escalationId);

      const result = await escalationManager.submitEscalation(escalationId);

      expect(result.error).toContain('already submitted');
    });

    it('should persist submission result to disk', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { confirmationId: 'conf-456' },
      });

      await escalationManager.submitEscalation(escalationId);

      const submissionsDir = path.join(testDataPath, 'submissions');
      const filePath = path.join(submissionsDir, `${escalationId}.json`);

      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const savedSubmission = JSON.parse(fileContent);

      expect(savedSubmission.escalationId).toBe(escalationId);
      expect(savedSubmission.submitted).toBe(true);
      expect(savedSubmission.confirmationId).toBe('conf-456');
    });
  });

  describe('Escalation Retrieval', () => {
    let authorityId: string;

    beforeEach(() => {
      const result = escalationManager.registerAuthority({
        authorityType: 'dao',
        name: 'Test DAO',
        contactInfo: 'https://api.testdao.com/escalations',
      });
      authorityId = result.authorityId!;
    });

    it('should get escalations for a dispute', async () => {
      await escalationManager.initiateEscalation({
        disputeId: 'dispute-100',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue 1'],
      });

      await escalationManager.initiateEscalation({
        disputeId: 'dispute-200',
        escalatedBy: 'party-2',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue 2'],
      });

      const escalations = escalationManager.getEscalationsForDispute('dispute-100');
      expect(escalations).toHaveLength(1);
      expect(escalations[0].disputeId).toBe('dispute-100');
    });

    it('should return empty array for dispute with no escalations', () => {
      const escalations = escalationManager.getEscalationsForDispute('non-existent');
      expect(escalations).toHaveLength(0);
    });

    it('should get submission result', async () => {
      const escalationResult = await escalationManager.initiateEscalation({
        disputeId: 'dispute-sub-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authorityId,
        scopeOfIssues: ['Issue'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { confirmationId: 'conf-xyz' },
      });

      await escalationManager.submitEscalation(escalationResult.escalationId!);

      const submission = escalationManager.getSubmission(
        escalationResult.escalationId!
      );

      expect(submission).toBeDefined();
      expect(submission?.submitted).toBe(true);
      expect(submission?.confirmationId).toBe('conf-xyz');
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', async () => {
      const arb1 = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Arbitrator 1',
        contactInfo: 'https://api.arbitrator1.com',
      });

      const arb2 = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Arbitrator 2',
        contactInfo: 'https://api.arbitrator2.com',
      });

      const dao1 = escalationManager.registerAuthority({
        authorityType: 'dao',
        name: 'DAO 1',
        contactInfo: 'https://api.dao1.com/escalations',
      });

      await escalationManager.initiateEscalation({
        disputeId: 'dispute-1',
        escalatedBy: 'party-1',
        targetAuthorityId: arb1.authorityId!,
        scopeOfIssues: ['Issue 1'],
        signature: 'sig-1',
      });

      const esc2 = await escalationManager.initiateEscalation({
        disputeId: 'dispute-2',
        escalatedBy: 'party-2',
        targetAuthorityId: dao1.authorityId!,
        scopeOfIssues: ['Issue 2'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { confirmationId: 'conf-1' },
      });

      await escalationManager.submitEscalation(esc2.escalationId!);

      const stats = escalationManager.getStats();

      expect(stats.totalEscalations).toBe(2);
      expect(stats.totalAuthorities).toBe(3);
      expect(stats.authoritiesByType.arbitrator).toBe(2);
      expect(stats.authoritiesByType.dao).toBe(1);
      expect(stats.escalationsSubmitted).toBe(1);
      expect(stats.escalationsPending).toBe(1);
      expect(stats.humanAuthorshipVerified).toBe(1);
    });
  });

  describe('Persistence and Loading', () => {
    it('should load existing escalations on initialization', async () => {
      const authResult = escalationManager.registerAuthority({
        authorityType: 'court',
        name: 'Persistent Court',
      });

      await escalationManager.initiateEscalation({
        disputeId: 'dispute-persist-1',
        escalatedBy: 'party-1',
        targetAuthorityId: authResult.authorityId!,
        scopeOfIssues: ['Persistent Issue'],
      });

      // Create new instance with same data path
      const newManager = new EscalationManager(config, testDataPath);

      const escalations = newManager.getEscalationsForDispute('dispute-persist-1');
      expect(escalations).toHaveLength(1);
      expect(escalations[0].scopeOfIssues).toContain('Persistent Issue');
    });

    it('should load existing authorities on initialization', () => {
      escalationManager.registerAuthority({
        authorityType: 'review_board',
        name: 'Persistent Board',
        jurisdiction: 'EU',
      });

      // Create new instance with same data path
      const newManager = new EscalationManager(config, testDataPath);

      const authorities = newManager.getAllAuthorities();
      expect(authorities.length).toBeGreaterThan(0);

      const board = authorities.find((a) => a.name === 'Persistent Board');
      expect(board).toBeDefined();
      expect(board?.jurisdiction).toBe('EU');
    });

    it('should load existing submissions on initialization', async () => {
      const authResult = escalationManager.registerAuthority({
        authorityType: 'arbitrator',
        name: 'Submission Test',
        contactInfo: 'https://api.test.com',
      });

      const escResult = await escalationManager.initiateEscalation({
        disputeId: 'dispute-sub-persist',
        escalatedBy: 'party-1',
        targetAuthorityId: authResult.authorityId!,
        scopeOfIssues: ['Issue'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { confirmationId: 'conf-persist' },
      });

      await escalationManager.submitEscalation(escResult.escalationId!);

      // Create new instance
      const newManager = new EscalationManager(config, testDataPath);

      const submission = newManager.getSubmission(escResult.escalationId!);
      expect(submission).toBeDefined();
      expect(submission?.submitted).toBe(true);
      expect(submission?.confirmationId).toBe('conf-persist');
    });
  });
});
