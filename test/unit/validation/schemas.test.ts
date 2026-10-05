import path from 'path';
import { z } from 'zod';
import {
  AuthenticationMessageSchema,
  BurnRecordSchema,
  ChallengeSchema,
  DelegationSchema,
  DisputeDeclarationSchema,
  EffortReceiptSchema,
  EffortSignalSchema,
  EvidenceItemSchema,
  FrozenItemSchema,
  GovernanceProposalSchema,
  GovernanceVoteSchema,
  IntentSchema,
  LicenseSchema,
  MP05SettlementSchema,
  PingMessageSchema,
  ProposedSettlementSchema,
  ProposedTermsSchema,
  ReputationRecordSchema,
  SafeIDSchema,
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  WebSocketMessageSchema,
  parseAndValidate,
  safeParseAndValidate,
  sanitizeFilename,
  validatePathWithinDirectory,
} from '../../../src/validation/schemas';

const NOW = 1700000000000;

const validIntent = {
  hash: 'intent-hash-1',
  author: 'alice',
  prose: 'I want to buy 100 widgets',
  timestamp: NOW,
  status: 'pending',
};

const validSettlement = {
  id: 'settlement-1',
  intentHashA: 'hash-a',
  intentHashB: 'hash-b',
  reasoningTrace: 'Both parties want widgets at $5',
  proposedTerms: { price: 500, deliverables: ['100 widgets'], timeline: '2 weeks' },
  facilitationFee: 25,
  facilitationFeePercent: 5,
  mediatorId: 'mediator-1',
  modelIntegrityHash: 'model-hash',
  timestamp: NOW,
  acceptanceDeadline: NOW + 72 * 3600 * 1000,
  status: 'proposed',
};

const validProposal = {
  id: 'prop-1',
  proposerId: 'mediator-1',
  title: 'Raise fee cap',
  description: 'Raise the facilitation fee cap to 6%',
  proposalType: 'parameter_change',
  votingPeriodEnd: NOW + 1000,
  executionDelay: 3600,
  status: 'voting',
  votes: { for: 10, against: 2, abstain: 1 },
  quorumRequired: 50,
  timestamp: NOW,
};

/** Validate and return the issue paths, for asserting which field was rejected. */
function issuePaths(schema: z.ZodTypeAny, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('validation schemas', () => {
  describe('IntentSchema', () => {
    it('accepts a minimal valid intent and defaults constraints/desires to []', () => {
      const parsed = IntentSchema.parse(validIntent);

      expect(parsed).toMatchObject(validIntent);
      expect(parsed.constraints).toEqual([]);
      expect(parsed.desires).toEqual([]);
    });

    it('accepts all optional fields', () => {
      const full = {
        ...validIntent,
        offeredFee: 10,
        constraints: ['delivery within 2 weeks'],
        desires: ['blue widgets'],
        branch: 'commerce',
        nonce: 'n-1',
        signature: 'sig',
        metadata: { source: 'chain' },
      };

      expect(IntentSchema.parse(full)).toEqual(full);
    });

    it('strips unknown fields', () => {
      const parsed = IntentSchema.parse({ ...validIntent, injected: '<script>' });

      expect(parsed).not.toHaveProperty('injected');
    });

    it.each([
      ['empty hash', { hash: '' }, 'hash'],
      ['oversized hash', { hash: 'h'.repeat(257) }, 'hash'],
      ['empty prose', { prose: '' }, 'prose'],
      ['oversized prose', { prose: 'p'.repeat(10001) }, 'prose'],
      ['non-integer timestamp', { timestamp: 1.5 }, 'timestamp'],
      ['negative timestamp', { timestamp: -1 }, 'timestamp'],
      ['unknown status', { status: 'deleted' }, 'status'],
      ['negative fee', { offeredFee: -1 }, 'offeredFee'],
      ['oversized constraint', { constraints: ['c'.repeat(1001)] }, 'constraints.0'],
      ['oversized signature', { signature: 's'.repeat(1025) }, 'signature'],
    ])('rejects %s', (_label, override, expectedPath) => {
      expect(issuePaths(IntentSchema, { ...validIntent, ...override })).toContain(expectedPath);
    });

    it('rejects a missing required field', () => {
      const { author: _author, ...withoutAuthor } = validIntent;

      expect(issuePaths(IntentSchema, withoutAuthor)).toEqual(['author']);
    });
  });

  describe('ProposedTermsSchema', () => {
    it('accepts an empty terms object', () => {
      expect(ProposedTermsSchema.parse({})).toEqual({});
    });

    it('rejects a negative price and oversized timeline', () => {
      expect(issuePaths(ProposedTermsSchema, { price: -5 })).toEqual(['price']);
      expect(issuePaths(ProposedTermsSchema, { timeline: 't'.repeat(501) })).toEqual(['timeline']);
    });
  });

  describe('ProposedSettlementSchema', () => {
    it('accepts a valid settlement', () => {
      expect(ProposedSettlementSchema.parse(validSettlement)).toEqual(validSettlement);
    });

    it.each([
      ['fee percent above 100', { facilitationFeePercent: 101 }, 'facilitationFeePercent'],
      ['negative fee percent', { facilitationFeePercent: -1 }, 'facilitationFeePercent'],
      ['confidence above 100', { confidence: 150 }, 'confidence'],
      ['oversized reasoning trace', { reasoningTrace: 'r'.repeat(20001) }, 'reasoningTrace'],
      ['invalid nested terms', { proposedTerms: { price: -1 } }, 'proposedTerms.price'],
      ['unknown status', { status: 'pending' }, 'status'],
    ])('rejects %s', (_label, override, expectedPath) => {
      expect(issuePaths(ProposedSettlementSchema, { ...validSettlement, ...override })).toContain(
        expectedPath
      );
    });
  });

  describe('DisputeDeclarationSchema', () => {
    const dispute = {
      disputeId: 'dispute-1',
      claimant: { partyId: 'alice' },
      contestedItems: [{ itemId: 'x' }],
      issueDescription: 'Goods not delivered',
      status: 'initiated',
      initiatedAt: NOW,
      updatedAt: NOW,
      evidence: [],
    };

    it('accepts a dispute and passes through additional fields', () => {
      const parsed = DisputeDeclarationSchema.parse({ ...dispute, extraField: 'kept' });

      expect(parsed).toMatchObject({ ...dispute, extraField: 'kept' });
    });

    it('rejects an unknown status and non-array evidence', () => {
      expect(issuePaths(DisputeDeclarationSchema, { ...dispute, status: 'open' })).toEqual(['status']);
      expect(issuePaths(DisputeDeclarationSchema, { ...dispute, evidence: 'none' })).toEqual(['evidence']);
    });
  });

  describe('EvidenceItemSchema', () => {
    const evidence = {
      itemId: 'ev-1',
      disputeId: 'dispute-1',
      submittedBy: 'alice',
      itemType: 'document',
      content: 'invoice text',
      contentHash: 'abc',
      timestamp: NOW,
      frozen: true,
    };

    it('accepts valid evidence', () => {
      expect(EvidenceItemSchema.parse(evidence)).toEqual(evidence);
    });

    it('rejects content over 100000 characters and unknown item types', () => {
      expect(issuePaths(EvidenceItemSchema, { ...evidence, content: 'x'.repeat(100001) })).toEqual([
        'content',
      ]);
      expect(issuePaths(EvidenceItemSchema, { ...evidence, itemType: 'video' })).toEqual(['itemType']);
    });
  });

  describe('LicenseSchema and DelegationSchema (MP-04)', () => {
    const license = {
      licenseId: 'lic-1',
      mediatorId: 'mediator-1',
      authorityId: 'authority-1',
      grantedAt: NOW,
      status: 'active',
      scope: 'limited',
      signature: 'sig',
    };
    const delegation = {
      delegationId: 'del-1',
      delegatorId: 'alice',
      delegateId: 'mediator-1',
      grantedAt: NOW,
      status: 'active',
      signature: 'sig',
    };

    it('accepts valid records', () => {
      expect(LicenseSchema.parse(license)).toEqual(license);
      expect(DelegationSchema.parse(delegation)).toEqual(delegation);
    });

    it('requires a signature', () => {
      const { signature: _l, ...unsignedLicense } = license;
      const { signature: _d, ...unsignedDelegation } = delegation;

      expect(issuePaths(LicenseSchema, unsignedLicense)).toEqual(['signature']);
      expect(issuePaths(DelegationSchema, unsignedDelegation)).toEqual(['signature']);
    });

    it('rejects statuses and scopes outside the allowed sets', () => {
      expect(issuePaths(LicenseSchema, { ...license, scope: 'unlimited' })).toEqual(['scope']);
      // "suspended" is valid for licenses but not delegations
      expect(LicenseSchema.safeParse({ ...license, status: 'suspended' }).success).toBe(true);
      expect(issuePaths(DelegationSchema, { ...delegation, status: 'suspended' })).toEqual(['status']);
    });
  });

  describe('EffortSignalSchema and EffortReceiptSchema (MP-02)', () => {
    const signal = { timestamp: NOW, modality: 'keystroke', intensity: 0.5 };
    const receipt = {
      receiptId: 'rcpt-1',
      userId: 'alice',
      startTime: NOW,
      endTime: NOW + 1000,
      signals: [signal],
      signalHash: 'hash',
      anchored: false,
    };

    it('accepts a valid receipt and passes through additional fields', () => {
      expect(EffortReceiptSchema.parse({ ...receipt, summary: 'kept' })).toMatchObject({
        ...receipt,
        summary: 'kept',
      });
    });

    it('bounds signal intensity to [0, 1]', () => {
      expect(EffortSignalSchema.safeParse({ ...signal, intensity: 1 }).success).toBe(true);
      expect(issuePaths(EffortSignalSchema, { ...signal, intensity: 1.01 })).toEqual(['intensity']);
    });

    it('validates each nested signal', () => {
      expect(
        issuePaths(EffortReceiptSchema, { ...receipt, signals: [signal, { ...signal, modality: 'telepathy' }] })
      ).toEqual(['signals.1.modality']);
    });
  });

  describe('GovernanceProposalSchema and GovernanceVoteSchema', () => {
    const vote = {
      id: 'vote-1',
      proposalId: 'prop-1',
      voterId: 'mediator-2',
      voteType: 'for',
      votingPower: 12.5,
      timestamp: NOW,
    };

    it('accepts valid proposals and votes', () => {
      expect(GovernanceProposalSchema.parse(validProposal)).toEqual(validProposal);
      expect(GovernanceVoteSchema.parse(vote)).toEqual(vote);
    });

    it('rejects negative vote tallies, quorum over 100 and unknown proposal types', () => {
      expect(
        issuePaths(GovernanceProposalSchema, { ...validProposal, votes: { for: -1, against: 0, abstain: 0 } })
      ).toEqual(['votes.for']);
      expect(issuePaths(GovernanceProposalSchema, { ...validProposal, quorumRequired: 101 })).toEqual([
        'quorumRequired',
      ]);
      expect(issuePaths(GovernanceProposalSchema, { ...validProposal, proposalType: 'self_destruct' })).toEqual([
        'proposalType',
      ]);
    });

    it('rejects negative voting power and unknown vote types', () => {
      expect(issuePaths(GovernanceVoteSchema, { ...vote, votingPower: -1 })).toEqual(['votingPower']);
      expect(issuePaths(GovernanceVoteSchema, { ...vote, voteType: 'veto' })).toEqual(['voteType']);
    });
  });

  describe('WebSocket message schemas', () => {
    it('accepts a valid authentication message and requires a signature', () => {
      const auth = { identity: 'alice', signature: 'sig', timestamp: NOW };

      expect(AuthenticationMessageSchema.parse(auth)).toEqual(auth);
      expect(issuePaths(AuthenticationMessageSchema, { ...auth, signature: '' })).toEqual(['signature']);
    });

    it('accepts subscriptions to known channels only', () => {
      expect(
        SubscribeMessageSchema.parse({ type: 'subscribe', channels: ['intents', 'settlements', 'metrics'] })
      ).toEqual({ type: 'subscribe', channels: ['intents', 'settlements', 'metrics'] });
      expect(issuePaths(SubscribeMessageSchema, { type: 'subscribe', channels: ['intents', 'admin'] })).toEqual([
        'channels.1',
      ]);
    });

    it('accepts unsubscribe and ping messages', () => {
      expect(UnsubscribeMessageSchema.parse({ type: 'unsubscribe', channels: ['intents'] })).toEqual({
        type: 'unsubscribe',
        channels: ['intents'],
      });
      expect(PingMessageSchema.parse({ type: 'ping' })).toEqual({ type: 'ping' });
      expect(PingMessageSchema.parse({ type: 'ping', timestamp: NOW })).toEqual({ type: 'ping', timestamp: NOW });
    });

    it('dispatches on the message type', () => {
      expect(WebSocketMessageSchema.parse({ type: 'ping' })).toEqual({ type: 'ping' });
      expect(WebSocketMessageSchema.parse({ type: 'unsubscribe', channels: ['x'] })).toEqual({
        type: 'unsubscribe',
        channels: ['x'],
      });
      expect(WebSocketMessageSchema.safeParse({ type: 'subscribe', channels: ['bogus'] }).success).toBe(false);
    });

    it('rejects unknown message types', () => {
      const result = WebSocketMessageSchema.safeParse({ type: 'admin', command: 'shutdown' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_union_discriminator');
      }
    });
  });

  describe('MP05SettlementSchema and BurnRecordSchema', () => {
    const mp05 = {
      settlementId: 's-1',
      intentHashA: 'a',
      intentHashB: 'b',
      mediatorId: 'mediator-1',
      agreedTerms: { price: 100 },
      facilitationFee: 5,
      timestamp: NOW,
      status: 'completed',
      burn: { baseBurn: 1, successBurn: 2, totalBurned: 3 },
    };
    const burn = {
      burnId: 'burn-1',
      userId: 'alice',
      intentHash: 'hash',
      burnType: 'filing',
      amount: 0.5,
      timestamp: NOW,
    };

    it('accepts valid records', () => {
      expect(MP05SettlementSchema.parse(mp05)).toEqual(mp05);
      expect(BurnRecordSchema.parse(burn)).toEqual(burn);
    });

    it('rejects negative burn amounts', () => {
      expect(
        issuePaths(MP05SettlementSchema, { ...mp05, burn: { baseBurn: -1, successBurn: 0, totalBurned: 0 } })
      ).toEqual(['burn.baseBurn']);
      expect(issuePaths(BurnRecordSchema, { ...burn, amount: -0.01 })).toEqual(['amount']);
    });

    it('rejects unknown burn types and settlement statuses', () => {
      expect(issuePaths(BurnRecordSchema, { ...burn, burnType: 'refund' })).toEqual(['burnType']);
      expect(issuePaths(MP05SettlementSchema, { ...mp05, status: 'proposed' })).toEqual(['status']);
    });
  });

  describe('ChallengeSchema and ReputationRecordSchema', () => {
    const challenge = {
      challengeId: 'c-1',
      settlementId: 's-1',
      challenger: 'mediator-2',
      reason: 'Terms contradict intent constraints',
      confidence: 80,
      timestamp: NOW,
      status: 'pending',
    };
    const reputation = {
      mediatorId: 'mediator-1',
      successfulClosures: 10,
      failedChallenges: 1,
      upheldChallengesAgainst: 0,
      forfeitedFees: 0,
      reputationWeight: 12,
      lastUpdated: NOW,
    };

    it('accepts valid records', () => {
      expect(ChallengeSchema.parse(challenge)).toEqual(challenge);
      expect(ReputationRecordSchema.parse(reputation)).toEqual(reputation);
    });

    it('bounds challenge confidence to [0, 100]', () => {
      expect(issuePaths(ChallengeSchema, { ...challenge, confidence: 100.5 })).toEqual(['confidence']);
      expect(issuePaths(ChallengeSchema, { ...challenge, confidence: -1 })).toEqual(['confidence']);
    });

    it('requires whole, non-negative reputation counters', () => {
      expect(issuePaths(ReputationRecordSchema, { ...reputation, successfulClosures: 1.5 })).toEqual([
        'successfulClosures',
      ]);
      expect(issuePaths(ReputationRecordSchema, { ...reputation, forfeitedFees: -1 })).toEqual(['forfeitedFees']);
    });
  });

  describe('FrozenItemSchema', () => {
    const frozen = {
      itemId: 'item-1',
      disputeId: 'dispute-1',
      itemType: 'settlement',
      snapshot: { any: 'thing' },
      snapshotHash: 'hash',
      frozenAt: NOW,
      frozenBy: 'system',
      status: 'under_dispute',
      mutationAttempts: [
        { timestamp: NOW, attemptedBy: 'bob', operationType: 'update', rejected: true, auditLog: 'blocked' },
      ],
    };

    it('accepts a frozen item and passes through additional fields', () => {
      expect(FrozenItemSchema.parse({ ...frozen, note: 'kept' })).toMatchObject({ ...frozen, note: 'kept' });
    });

    it('validates mutation attempts', () => {
      expect(
        issuePaths(FrozenItemSchema, {
          ...frozen,
          mutationAttempts: [{ ...frozen.mutationAttempts[0], operationType: 'create' }],
        })
      ).toEqual(['mutationAttempts.0.operationType']);
    });
  });

  describe('parseAndValidate', () => {
    it('parses JSON and returns the validated data with defaults applied', () => {
      const result = parseAndValidate(JSON.stringify(validIntent), IntentSchema);

      expect(result).toMatchObject(validIntent);
      expect(result.constraints).toEqual([]);
    });

    it('throws a ZodError when the data does not match the schema', () => {
      expect(() => parseAndValidate(JSON.stringify({ ...validIntent, status: 'bogus' }), IntentSchema)).toThrow(
        z.ZodError
      );
    });

    it('throws a SyntaxError for malformed JSON', () => {
      expect(() => parseAndValidate('{not json', IntentSchema)).toThrow(SyntaxError);
    });
  });

  describe('safeParseAndValidate', () => {
    it('returns success with the validated data', () => {
      const result = safeParseAndValidate(JSON.stringify(validIntent), IntentSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(validIntent);
        expect(result.data.desires).toEqual([]);
      }
    });

    it('reports malformed JSON as a parse failure', () => {
      const result = safeParseAndValidate('{not json', IntentSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/^Parse failed: /);
      }
    });

    it('reports schema violations with dotted paths, joined by commas', () => {
      const invalid = { ...validProposal, title: '', votes: { for: -1, against: 0, abstain: 0 } };

      const result = safeParseAndValidate(JSON.stringify(invalid), GovernanceProposalSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/^Validation failed: /);
        expect(result.error).toContain('title: ');
        expect(result.error).toContain('votes.for: ');
        expect(result.error).toContain(', ');
      }
    });

    it('does not allow prototype pollution through __proto__ keys', () => {
      const malicious = `{"__proto__": {"polluted": true}, ${JSON.stringify(validIntent).slice(1)}`;

      const result = safeParseAndValidate(malicious, IntentSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.prototype.hasOwnProperty.call(result.data, '__proto__')).toBe(false);
        expect((result.data as Record<string, unknown>).polluted).toBeUndefined();
      }
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('does not pass __proto__ keys through passthrough schemas', () => {
      const dispute = {
        disputeId: 'd-1',
        claimant: 'alice',
        contestedItems: [],
        issueDescription: 'x',
        status: 'initiated',
        initiatedAt: NOW,
        updatedAt: NOW,
        evidence: [],
      };
      const malicious = `{"__proto__": {"polluted": true}, ${JSON.stringify(dispute).slice(1)}`;

      const result = safeParseAndValidate(malicious, DisputeDeclarationSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.prototype.hasOwnProperty.call(result.data, '__proto__')).toBe(false);
        expect((result.data as Record<string, unknown>).polluted).toBeUndefined();
      }
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('SafeIDSchema', () => {
    it.each(['abc', 'intent_123', 'A-b_C-9', 'x'.repeat(256)])('accepts %s', (id) => {
      expect(SafeIDSchema.parse(id)).toBe(id);
    });

    it.each(['', '../etc/passwd', 'a/b', 'a\\b', 'file.json', 'a b', 'id\0', 'x'.repeat(257)])(
      'rejects %j',
      (id) => {
        expect(SafeIDSchema.safeParse(id).success).toBe(false);
      }
    );

    it('explains the allowed character set', () => {
      const result = SafeIDSchema.safeParse('../x');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('ID must be alphanumeric with hyphens/underscores only');
      }
    });
  });

  describe('sanitizeFilename', () => {
    it('leaves safe identifiers unchanged', () => {
      expect(sanitizeFilename('intent-123_abc')).toBe('intent-123_abc');
    });

    it('neutralises path traversal sequences', () => {
      const sanitized = sanitizeFilename('../../etc/passwd');

      expect(sanitized).toBe('______etc_passwd');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('..');
    });

    it.each(['/', '\\', '.', '\0', '<', '>', ':', '"', '|', '?', '*'])('replaces %j with an underscore', (ch) => {
      expect(sanitizeFilename(`a${ch}b`)).toBe('a_b');
    });

    it('replaces every occurrence', () => {
      expect(sanitizeFilename('C:\\a\\b')).toBe('C__a_b');
    });
  });

  describe('validatePathWithinDirectory', () => {
    const baseDir = path.resolve('/srv/mediator/data');

    it('accepts a file directly inside the base directory', () => {
      expect(validatePathWithinDirectory(path.join(baseDir, 'intent.json'), baseDir)).toBe(true);
    });

    it('accepts a nested file', () => {
      expect(validatePathWithinDirectory(path.join(baseDir, 'intents', '2026', 'a.json'), baseDir)).toBe(true);
    });

    it('accepts paths that normalise back inside the base directory', () => {
      expect(validatePathWithinDirectory(`${baseDir}/sub/../intent.json`, baseDir)).toBe(true);
    });

    it('resolves relative paths against the working directory', () => {
      expect(validatePathWithinDirectory('data/intents/a.json', 'data')).toBe(true);
      expect(validatePathWithinDirectory('other/a.json', 'data')).toBe(false);
    });

    it('rejects ../ traversal out of the base directory', () => {
      expect(validatePathWithinDirectory(`${baseDir}/../../../etc/passwd`, baseDir)).toBe(false);
      expect(validatePathWithinDirectory(`${baseDir}/../secrets.json`, baseDir)).toBe(false);
    });

    it('rejects an absolute path elsewhere on the filesystem', () => {
      expect(validatePathWithinDirectory(path.resolve('/etc/passwd'), baseDir)).toBe(false);
    });

    it('rejects the parent directory', () => {
      expect(validatePathWithinDirectory(path.dirname(baseDir), baseDir)).toBe(false);
    });

    it('rejects a sibling directory that shares the base path as a prefix', () => {
      expect(validatePathWithinDirectory(`${baseDir}-evil/intent.json`, baseDir)).toBe(false);
      expect(validatePathWithinDirectory(`${baseDir}2`, baseDir)).toBe(false);
    });

    it('accepts the base directory itself', () => {
      expect(validatePathWithinDirectory(baseDir, baseDir)).toBe(true);
    });
  });
});
