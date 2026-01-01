# Documentation Index

This index provides a complete guide to all documentation in the mediator-node repository.

**Last Updated:** January 1, 2026

---

## Core Documentation

### Getting Started
- **[README.md](./README.md)** - Project overview, quick start, features, and architecture summary
- **[INTEGRATION.md](./INTEGRATION.md)** - Integration guide for connecting to NatLangChain

### API & Operations
- **[docs/API.md](./docs/API.md)** - Complete API reference (HTTP endpoints, WebSocket events, ChainClient)
- **[docs/OPERATIONS.md](./docs/OPERATIONS.md)** - Operations runbook for production deployment

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system architecture and component design (19 components documented)
- **[spec.md](./spec.md)** - Complete protocol specification (MP-01)

### Security
- **[docs/SECURITY_HARDENING.md](./docs/SECURITY_HARDENING.md)** - Security audit and hardening guide

### Community & Governance
- **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** - Community standards and behavior guidelines
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and process
- **[FAQ.md](./FAQ.md)** - Frequently asked questions about challenges and resilience
- **[Founding-Contributor-Pledge.md](./Founding-Contributor-Pledge.md)** - Ethical commitments for contributors

---

## Protocol Specifications

All extension protocols are **fully implemented**. Standalone specification documents:

### Mediator Protocols (MP)
- **[docs/MP-02-spec.md](./docs/MP-02-spec.md)** - Proof-of-Effort Receipt Protocol
- **[docs/MP-03-spec.md](./docs/MP-03-spec.md)** - Dispute & Escalation System
- **[docs/MP-04-spec.md](./docs/MP-04-spec.md)** - Licensing & Delegation Protocol
- **[docs/MP-05-spec.md](./docs/MP-05-spec.md)** - Settlement & Capitalization Protocol
- **[docs/MP-06-spec.md](./docs/MP-06-spec.md)** - Behavioral Pressure & Anti-Entropy Controls

### Additional Protocol Documentation
- **[docs/Escalation-Protocol.md](./docs/Escalation-Protocol.md)** - Detailed escalation workflow
- **[docs/Observance-Burn.md](./docs/Observance-Burn.md)** - Burn economics deep dive
- **[docs/Validator-Reference-Guide.md](./docs/Validator-Reference-Guide.md)** - DPoS validator documentation

### NatLangChain Improvement Proposals (NCIP)
Semantic governance specifications defining canonical terminology and protocol semantics:

| Document | Title |
|----------|-------|
| [NCIP-000](./docs/NCIP-000.md) | Terminology & Semantics Governance (foundational) |
| [NCIP-001](./docs/NCIP-001.md) | Canonical Term Registry |
| [NCIP-002](./docs/NCIP-002.md) | Intent Semantics |
| [NCIP-003](./docs/NCIP-003.md) | Settlement Semantics |
| [NCIP-004](./docs/NCIP-004.md) | Challenge Semantics |
| [NCIP-005](./docs/NCIP-005.md) | Reputation Semantics |
| [NCIP-006](./docs/NCIP-006.md) | Consensus Semantics |
| [NCIP-007](./docs/NCIP-007.md) | Governance Semantics |
| [NCIP-008](./docs/NCIP-008.md) | Delegation Semantics |
| [NCIP-009](./docs/NCIP-009.md) | Dispute Semantics |
| [NCIP-010](./docs/NCIP-010.md) | Receipt Semantics |
| [NCIP-011](./docs/NCIP-011.md) | Burn Semantics |
| [NCIP-012](./docs/NCIP-012.md) | License Semantics |
| [NCIP-013](./docs/NCIP-013.md) | Validator Semantics |
| [NCIP-014](./docs/NCIP-014.md) | Network Semantics |
| [NCIP-015](./docs/NCIP-015.md) | Security Semantics |

---

## Quick Reference by Use Case

| I want to... | Read this |
|--------------|-----------|
| Understand what this project does | [README.md](./README.md) |
| Run the mediator node | [README.md](./README.md) (Quick Start section) |
| Understand the architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Implement/extend the protocol | [spec.md](./spec.md) and MP-XX specs in `docs/` |
| Verify security | [docs/SECURITY_HARDENING.md](./docs/SECURITY_HARDENING.md) |
| Integrate with my chain | [INTEGRATION.md](./INTEGRATION.md) |
| Use the API | [docs/API.md](./docs/API.md) |
| Deploy to production | [docs/OPERATIONS.md](./docs/OPERATIONS.md) |
| Contribute to the project | [CONTRIBUTING.md](./CONTRIBUTING.md) |

---

## Developer Reference

### Key Code Locations

```
src/
├── MediatorNode.ts                # Main orchestrator (1,350+ lines)
├── types/index.ts                 # Core type definitions (600+ lines)
├── cli.ts                         # CLI interface
│
├── ingestion/                     # Intent ingestion
│   └── IntentIngester.ts          # Chain polling & validation
├── mapping/                       # Semantic search
│   ├── VectorDatabase.ts          # HNSW vector index
│   └── IntentClusteringService.ts # Intent clustering
├── llm/                           # LLM integration
│   └── LLMProvider.ts             # Anthropic/OpenAI integration
│
├── effort/                        # MP-02: Proof-of-Effort
│   ├── EffortCaptureSystem.ts     # Main capture system
│   ├── ReceiptManager.ts          # Receipt generation
│   ├── SegmentationEngine.ts      # Temporal segmentation
│   ├── AnchoringService.ts        # Blockchain anchoring
│   └── observers/                 # Signal observers
│       ├── CommandObserver.ts
│       ├── SignalObserver.ts
│       └── TextEditObserver.ts
├── dispute/                       # MP-03: Disputes
│   ├── DisputeManager.ts          # Main dispute handler
│   ├── ClarificationManager.ts    # Clarification rounds
│   ├── EvidenceManager.ts         # Evidence collection
│   ├── EscalationManager.ts       # Escalation handling
│   └── OutcomeRecorder.ts         # Resolution recording
├── licensing/                     # MP-04: Licensing
│   ├── LicensingManager.ts        # Main license handler
│   ├── LicenseManager.ts          # License CRUD
│   └── DelegationManager.ts       # Delegation handling
├── settlement/                    # MP-05: Settlement
│   ├── SettlementManager.ts       # Core settlement logic
│   ├── MP05SettlementManager.ts   # MP-05 extensions
│   ├── MP05SettlementCoordinator.ts
│   ├── MP05CapitalizationManager.ts
│   └── MP05SettlementValidator.ts
├── burn/                          # MP-06: Behavioral Pressure
│   ├── BurnManager.ts             # Burn calculations
│   ├── LoadMonitor.ts             # Network load tracking
│   └── BurnAnalytics.ts           # Burn analytics
│
├── consensus/                     # Consensus mechanisms
│   ├── StakeManager.ts            # DPoS stake management
│   ├── AuthorityManager.ts        # PoA authority set
│   ├── ValidatorRotationManager.ts # DPoS slot rotation
│   └── SemanticConsensusManager.ts # High-value verification
├── governance/                    # Governance
│   └── GovernanceManager.ts       # Stake-weighted voting
├── challenge/                     # Challenge system
│   ├── ChallengeDetector.ts       # Challenge detection
│   └── ChallengeManager.ts        # Challenge handling
├── sybil/                         # Sybil resistance
│   ├── SpamProofDetector.ts       # Spam detection
│   └── SubmissionTracker.ts       # Rate tracking
│
├── websocket/                     # Real-time updates
│   ├── WebSocketServer.ts         # WebSocket server
│   ├── EventPublisher.ts          # Event publishing
│   └── AuthenticationService.ts   # WS authentication
├── monitoring/                    # Health & metrics
│   ├── HealthServer.ts            # HTTP health endpoints
│   ├── HealthMonitor.ts           # Component monitoring
│   └── PerformanceAnalytics.ts    # Performance tracking
├── security/                      # Security testing
│   ├── VulnerabilityScanner.ts    # Vulnerability scanning
│   ├── SecurityTestRunner.ts      # Test execution
│   └── SecurityReportGenerator.ts # Report generation
├── network/                       # Multi-chain
│   ├── MultiChainOrchestrator.ts  # Chain coordination
│   └── MediatorNetworkCoordinator.ts
│
├── chain/                         # Chain client
│   ├── ChainClient.ts             # API abstraction (22KB)
│   └── transformers.ts            # Data transformation
├── config/                        # Configuration
│   └── ConfigLoader.ts            # Environment loading
├── reputation/                    # Reputation
│   └── ReputationTracker.ts       # MP-01 reputation
├── validation/                    # Input validation
│   ├── schemas.ts                 # Zod schemas
│   └── input-limits.ts            # Rate limits
└── utils/                         # Utilities
    ├── logger.ts                  # Winston logging
    ├── crypto.ts                  # Cryptographic ops
    ├── circuit-breaker.ts         # Resilience pattern
    ├── timeout.ts                 # Timeout handling
    └── prompt-security.ts         # LLM prompt security
```

### Test Coverage

```
test/
├── unit/                  # 200+ unit tests
│   ├── consensus/         # ValidatorRotationManager, StakeManager
│   ├── security/          # VulnerabilityScanner, SecurityTestRunner
│   ├── challenge/         # ChallengeDetector, ChallengeManager
│   ├── sybil/             # SpamProofDetector, SubmissionTracker
│   ├── burn/              # BurnManager, LoadMonitor
│   └── dispute/           # DisputeManager, EvidenceManager
├── integration/           # 30+ integration tests
│   ├── IntentSubmission.test.ts
│   ├── BurnAnalytics.test.ts
│   ├── ChallengeLifecycle.test.ts
│   ├── ConsensusMode.test.ts
│   ├── SemanticConsensusLifecycle.test.ts
│   └── LoadBasedScaling.test.ts
├── settlement/            # 10+ settlement tests
├── dispute/               # Dispute system tests
├── websocket/             # WebSocket tests
└── e2e/                   # End-to-end simulations
    └── ComprehensiveSimulation.test.ts
```

---

## Support & Contribution

- **Issues:** https://github.com/kase1111-hash/mediator-node/issues
- **Discussions:** https://github.com/kase1111-hash/mediator-node/discussions
- **Contact:** kase1111@gmail.com
