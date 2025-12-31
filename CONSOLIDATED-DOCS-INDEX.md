# Documentation Index

**Last Updated:** December 31, 2025

This index provides a clear guide to all documentation in the mediator-node repository.

---

## 📚 Core Documentation

### Getting Started
- **[README.md](./README.md)** - Project overview, features, and architecture summary
- **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes with Docker or manual setup
- **[INTEGRATION.md](./INTEGRATION.md)** - Integration guide for connecting to NatLangChain

### API & Operations
- **[docs/API.md](./docs/API.md)** - Complete API reference (HTTP endpoints, WebSocket events, ChainClient)
- **[docs/OPERATIONS.md](./docs/OPERATIONS.md)** - Operations runbook for production deployment

### Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed system architecture and component design
- **[spec.md](./spec.md)** - Complete protocol specification (MP-01 through MP-06)

### Implementation Status
- **[IMPLEMENTATION-VERIFICATION.md](./IMPLEMENTATION-VERIFICATION.md)** - Feature completion status and verification steps

### Security
- **[docs/SECURITY_HARDENING.md](./docs/SECURITY_HARDENING.md)** - Complete security audit and hardening guide

### Community & Governance
- **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** - Community standards and behavior guidelines
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and process
- **[FAQ.md](./FAQ.md)** - Frequently asked questions about challenges and resilience
- **[Founding-Contributor-Pledge.md](./Founding-Contributor-Pledge.md)** - Ethical commitments for contributors

---

## 📋 Protocol Specifications

All extension protocols are **fully implemented**. Standalone specification documents:

- **[docs/MP-02-spec.md](./docs/MP-02-spec.md)** - Proof-of-Effort Receipt Protocol
- **[docs/MP-03-spec.md](./docs/MP-03-spec.md)** - Dispute & Escalation System
- **[docs/MP-04-spec.md](./docs/MP-04-spec.md)** - Licensing & Delegation Protocol
- **[docs/MP-05-spec.md](./docs/MP-05-spec.md)** - Settlement & Capitalization Protocol
- **[docs/MP-06-spec.md](./docs/MP-06-spec.md)** - Behavioral Pressure & Anti-Entropy Controls

---

## 🎯 Quick Reference by Use Case

### I want to...

**...understand what this project does**
→ Start with [README.md](./README.md)

**...run the mediator node**
→ Follow [QUICKSTART.md](./QUICKSTART.md)

**...understand the architecture**
→ Read [ARCHITECTURE.md](./ARCHITECTURE.md)

**...implement/extend the protocol**
→ Study [spec.md](./spec.md) and relevant MP-XX specs

**...verify security**
→ Review [docs/SECURITY_HARDENING.md](./docs/SECURITY_HARDENING.md)

**...check feature status**
→ See [IMPLEMENTATION-VERIFICATION.md](./IMPLEMENTATION-VERIFICATION.md)

**...integrate with my chain**
→ Follow [INTEGRATION.md](./INTEGRATION.md)

**...use the API**
→ Reference [docs/API.md](./docs/API.md)

**...deploy to production**
→ Follow [docs/OPERATIONS.md](./docs/OPERATIONS.md)

**...contribute to the project**
→ Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

**...understand the ethical commitments**
→ Review [Founding-Contributor-Pledge.md](./Founding-Contributor-Pledge.md)

---

## 📊 Implementation Status Summary

### ✅ Fully Implemented (100%)

**Core Protocol (MP-01)**
- Alignment cycle (ingest, map, negotiate, submit)
- Consensus modes (Permissionless, DPoS, PoA, Hybrid)
- Reputation system
- Challenge proof submission
- Sybil resistance mechanisms

**Extension Protocols**
- MP-02: Proof-of-Effort (`src/effort/`)
- MP-03: Dispute & Escalation (`src/dispute/`)
- MP-04: Licensing & Delegation (`src/licensing/`)
- MP-05: Settlement & Capitalization (`src/settlement/`)
- MP-06: Behavioral Pressure (`src/burn/`)

**Infrastructure**
- WebSocket real-time updates
- Intent clustering & batch mediation
- ML-based candidate prioritization (HNSW)
- Distributed mediator coordination
- Multi-chain orchestration
- Semantic consensus verification
- Complete governance system
- DPoS validator rotation (slot-based scheduling)
- Automated security testing framework
- Comprehensive test suite (1261+ tests)

### ⚠️ Enhancement Opportunities (Non-Critical)
- Fee distribution to delegators
- Custom chain integration abstraction
- Unbonding period enforcement
- Process management (daemon mode)

---

## 📝 Documentation Organization

### Removed/Consolidated Files

The following files were consolidated to reduce redundancy:

- ❌ **negotiation-protocol.md** - Content integrated into spec.md
- ❌ **step-by-step.md** - Content integrated into QUICKSTART.md
- ❌ **Foundation.md** - Genesis document, content referenced in spec.md

These consolidations reduce maintenance burden while preserving all technical content.

---

## 🔧 Developer Reference

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

## 📧 Support & Contribution

- **Issues:** https://github.com/kase1111-hash/mediator-node/issues
- **Discussions:** https://github.com/kase1111-hash/mediator-node/discussions
- **Contact:** kase1111@gmail.com

---

**Total Documentation:** 13 core docs + 5 protocol specs = 18 files
**Implementation Status:** All protocols (MP-01 through MP-06) fully implemented
**Test Coverage:** 1261+ tests across all modules
