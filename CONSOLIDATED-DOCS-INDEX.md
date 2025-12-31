# Documentation Index

This index provides a clear guide to all documentation in the mediator-node repository.

---

## Core Documentation

### Getting Started
- **[README.md](./README.md)** - Project overview, quick start, features, and architecture summary
- **[INTEGRATION.md](./INTEGRATION.md)** - Integration guide for connecting to NatLangChain

### API & Operations
- **[docs/API.md](./docs/API.md)** - Complete API reference (HTTP endpoints, WebSocket events, ChainClient)
- **[docs/OPERATIONS.md](./docs/OPERATIONS.md)** - Operations runbook for production deployment

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system architecture and component design
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

- **[docs/MP-02-spec.md](./docs/MP-02-spec.md)** - Proof-of-Effort Receipt Protocol
- **[docs/MP-03-spec.md](./docs/MP-03-spec.md)** - Dispute & Escalation System
- **[docs/MP-04-spec.md](./docs/MP-04-spec.md)** - Licensing & Delegation Protocol
- **[docs/MP-05-spec.md](./docs/MP-05-spec.md)** - Settlement & Capitalization Protocol
- **[docs/MP-06-spec.md](./docs/MP-06-spec.md)** - Behavioral Pressure & Anti-Entropy Controls

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
├── effort/                        # MP-02: Proof-of-Effort
│   ├── ReceiptManager.ts
│   ├── EffortCaptureSystem.ts
│   └── SegmentationEngine.ts
├── dispute/                       # MP-03: Disputes
│   ├── DisputeManager.ts
│   ├── EvidenceManager.ts
│   └── EscalationManager.ts
├── licensing/                     # MP-04: Licensing
│   ├── LicenseManager.ts
│   └── DelegationManager.ts
├── settlement/                    # MP-05: Settlement
│   ├── MP05SettlementManager.ts
│   └── MP05CapitalizationManager.ts
├── burn/                          # MP-06: Behavioral Pressure
│   ├── BurnManager.ts
│   └── LoadMonitor.ts
├── mapping/                       # Intent matching
│   ├── VectorDatabase.ts
│   └── IntentClusteringService.ts
├── network/                       # Multi-chain
│   ├── MultiChainOrchestrator.ts
│   └── MediatorNetworkCoordinator.ts
├── websocket/                     # Real-time updates
│   ├── WebSocketServer.ts
│   └── EventPublisher.ts
├── governance/                    # Governance
│   └── GovernanceManager.ts
├── challenge/                     # Challenge system
│   ├── ChallengeDetector.ts
│   └── ChallengeManager.ts
├── sybil/                         # Sybil resistance
│   ├── SpamProofDetector.ts
│   └── SubmissionTracker.ts
├── monitoring/                    # Health monitoring
│   └── HealthServer.ts
├── security/                      # Automated security testing
│   ├── VulnerabilityScanner.ts
│   ├── SecurityTestRunner.ts
│   └── SecurityReportGenerator.ts
└── consensus/                     # Consensus
    ├── SemanticConsensusManager.ts
    ├── StakeManager.ts
    ├── AuthorityManager.ts
    └── ValidatorRotationManager.ts  # DPoS slot-based rotation
```

### Test Coverage

```
test/
├── unit/                  # 200+ unit tests
│   ├── consensus/         # ValidatorRotationManager tests
│   ├── security/          # VulnerabilityScanner, SecurityTestRunner, SecurityReportGenerator tests
│   ├── challenge/         # ChallengeDetector, ChallengeManager tests
│   └── sybil/             # SpamProofDetector, SubmissionTracker tests
├── integration/           # 30+ integration tests
└── settlement/            # 10+ settlement tests
```

---

## Support & Contribution

- **Issues:** https://github.com/kase1111-hash/mediator-node/issues
- **Discussions:** https://github.com/kase1111-hash/mediator-node/discussions
- **Contact:** kase1111@gmail.com
