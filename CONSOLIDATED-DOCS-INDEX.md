# Documentation Index

This index provides a complete guide to all documentation in the mediator-node repository.

**Last Updated:** January 1, 2026

---

## Core Documentation

### Getting Started
- **[README.md](./README.md)** - Project overview, quick start, features, and architecture summary
- **[INTEGRATION.md](./INTEGRATION.md)** - Integration guide for connecting to NatLangChain

### API & Operations
- **[_deferred/docs/API.md](./_deferred/docs/API.md)** - Complete API reference (HTTP endpoints, WebSocket events, ChainClient)
- **[_deferred/docs/OPERATIONS.md](./_deferred/docs/OPERATIONS.md)** - Operations runbook for production deployment

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system architecture and component design (19 components documented)
- **[spec.md](./spec.md)** - Complete protocol specification (MP-01)

### Security
- **[_deferred/docs/SECURITY_HARDENING.md](./_deferred/docs/SECURITY_HARDENING.md)** - Security audit and hardening guide

### Community & Governance
- **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** - Community standards and behavior guidelines
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and process
- **[FAQ.md](./FAQ.md)** - Frequently asked questions about challenges and resilience
- **[Founding-Contributor-Pledge.md](./Founding-Contributor-Pledge.md)** - Ethical commitments for contributors

---

## Protocol Specifications

All extension protocols are **fully implemented**. Standalone specification documents:

### Mediator Protocols (MP)
- **[_deferred/docs/MP-02-spec.md](./_deferred/docs/MP-02-spec.md)** - Proof-of-Effort Receipt Protocol
- **[_deferred/docs/MP-03-spec.md](./_deferred/docs/MP-03-spec.md)** - Dispute & Escalation System
- **[_deferred/docs/MP-04-spec.md](./_deferred/docs/MP-04-spec.md)** - Licensing & Delegation Protocol
- **[_deferred/docs/MP-05-spec.md](./_deferred/docs/MP-05-spec.md)** - Settlement & Capitalization Protocol
- **[_deferred/docs/MP-06-spec.md](./_deferred/docs/MP-06-spec.md)** - Behavioral Pressure & Anti-Entropy Controls

### Additional Protocol Documentation
- **[_deferred/docs/Escalation-Protocol.md](./_deferred/docs/Escalation-Protocol.md)** - Detailed escalation workflow
- **[_deferred/docs/Observance-Burn.md](./_deferred/docs/Observance-Burn.md)** - Burn economics deep dive
- **[_deferred/docs/Validator-Reference-Guide.md](./_deferred/docs/Validator-Reference-Guide.md)** - DPoS validator documentation

### NatLangChain Improvement Proposals (NCIP)
Semantic governance specifications defining canonical terminology and protocol semantics:

| Document | Title |
|----------|-------|
| [NCIP-000](./_deferred/docs/NCIP-000.md) | Terminology & Semantics Governance (foundational) |
| [NCIP-001](./_deferred/docs/NCIP-001.md) | Canonical Term Registry |
| [NCIP-002](./_deferred/docs/NCIP-002.md) | Intent Semantics |
| [NCIP-003](./_deferred/docs/NCIP-003.md) | Settlement Semantics |
| [NCIP-004](./_deferred/docs/NCIP-004.md) | Challenge Semantics |
| [NCIP-005](./_deferred/docs/NCIP-005.md) | Reputation Semantics |
| [NCIP-006](./_deferred/docs/NCIP-006.md) | Consensus Semantics |
| [NCIP-007](./_deferred/docs/NCIP-007.md) | Governance Semantics |
| [NCIP-008](./_deferred/docs/NCIP-008.md) | Delegation Semantics |
| [NCIP-009](./_deferred/docs/NCIP-009.md) | Dispute Semantics |
| [NCIP-010](./_deferred/docs/NCIP-010.md) | Receipt Semantics |
| [NCIP-011](./_deferred/docs/NCIP-011.md) | Burn Semantics |
| [NCIP-012](./_deferred/docs/NCIP-012.md) | License Semantics |
| [NCIP-013](./_deferred/docs/NCIP-013.md) | Validator Semantics |
| [NCIP-014](./_deferred/docs/NCIP-014.md) | Network Semantics |
| [NCIP-015](./_deferred/docs/NCIP-015.md) | Security Semantics |

---

## Quick Reference by Use Case

| I want to... | Read this |
|--------------|-----------|
| Understand what this project does | [README.md](./README.md) |
| Run the mediator node | [README.md](./README.md) (Quick Start section) |
| Understand the architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Implement/extend the protocol | [spec.md](./spec.md) and MP-XX specs in `docs/` |
| Verify security | [_deferred/docs/SECURITY_HARDENING.md](./_deferred/docs/SECURITY_HARDENING.md) |
| Integrate with my chain | [INTEGRATION.md](./INTEGRATION.md) |
| Use the API | [_deferred/docs/API.md](./_deferred/docs/API.md) |
| Deploy to production | [_deferred/docs/OPERATIONS.md](./_deferred/docs/OPERATIONS.md) |
| Contribute to the project | [CONTRIBUTING.md](./CONTRIBUTING.md) |

---

## Developer Reference

### Key Code Locations

```
src/
├── MediatorNode.ts            # Main orchestrator (~560 lines)
├── types/index.ts             # Core type definitions (600+ lines)
├── cli.ts                     # CLI interface
├── index.ts                   # Public exports
│
├── ingestion/                 # Intent ingestion
│   └── IntentIngester.ts      # Chain polling & validation
├── mapping/                   # Semantic search
│   └── VectorDatabase.ts      # HNSW vector index
├── llm/                       # LLM integration
│   └── LLMProvider.ts         # Anthropic/OpenAI integration
│
├── settlement/                # Settlement lifecycle
│   └── SettlementManager.ts   # Core settlement logic
├── reputation/                # Reputation
│   └── ReputationTracker.ts   # MP-01 reputation
├── challenge/                 # Challenge system
│   ├── ChallengeDetector.ts   # Challenge detection
│   └── ChallengeManager.ts    # Challenge handling
│
├── chain/                     # Chain client
│   ├── ChainClient.ts         # NatLangChain API adapter
│   └── transformers.ts        # Data transformation
├── config/                    # Configuration
│   └── ConfigLoader.ts        # Environment loading
├── monitoring/                # Health & metrics
│   └── HealthServer.ts        # HTTP health endpoints
├── validation/                # Input validation
│   └── schemas.ts             # Zod schemas
└── utils/                     # Utilities
    ├── logger.ts              # Winston logging
    ├── crypto.ts              # Cryptographic ops
    ├── circuit-breaker.ts     # Resilience pattern
    ├── timeout.ts             # Timeout handling
    └── prompt-security.ts     # LLM prompt security
```

### Test Coverage

```
test/
├── setup.ts                   # Global test setup
├── fixtures/                  # Test data (intents, settlements)
├── utils/                     # Test utilities
├── unit/                      # Unit tests (13 suites)
│   ├── MediatorNode.test.ts   # Orchestrator tests
│   ├── chain/                 # ChainClient, transformers
│   ├── challenge/             # ChallengeDetector, ChallengeManager
│   ├── config/                # ConfigLoader
│   ├── ingestion/             # IntentIngester
│   ├── llm/                   # LLMProvider
│   ├── mapping/               # VectorDatabase
│   ├── reputation/            # ReputationTracker
│   └── settlement/            # SettlementManager
└── integration/               # End-to-end tests
    ├── AlignmentCycle.test.ts  # Full alignment cycle
    └── ChallengeLifecycle.test.ts  # Challenge lifecycle
```

---

## Support & Contribution

- **Issues:** https://github.com/kase1111-hash/mediator-node/issues
- **Discussions:** https://github.com/kase1111-hash/mediator-node/discussions
- **Contact:** kase1111@gmail.com
