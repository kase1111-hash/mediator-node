# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha] - 2026-01-01

### Added

#### Core Features
- **Intent Ingestion**: Monitors blockchain for pending intents with validation and caching
- **Semantic Mapping**: Vector embeddings with HNSW index for fast similarity search
- **LLM Negotiation**: Multi-turn dialogue simulation using Anthropic Claude or OpenAI
- **Settlement Proposals**: Automated settlement creation and chain submission
- **Fee Collection**: Facilitation fee claiming on successful settlements

#### Consensus Modes
- **Permissionless**: Pure Proof-of-Alignment + Reputation-based consensus
- **DPoS**: Delegated Proof-of-Stake with validator rotation and governance
- **PoA**: Proof-of-Authority for permissioned enterprise environments
- **Hybrid**: Configurable combinations of consensus mechanisms

#### Protocol Extensions
- **MP-01**: Receipt-based reputation system with weighted scoring
- **MP-02**: Proof-of-Effort Receipt Protocol for temporal effort tracking
- **MP-03**: Dispute & Escalation System with clarification, evidence, and appeals
- **MP-04**: Licensing & Delegation Protocol for authority management
- **MP-05**: Settlement & Capitalization Protocol for coordinated settlements
- **MP-06**: Behavioral Pressure & Anti-Entropy Controls with token burn economics

#### Security Features
- Automated vulnerability scanning with OWASP/CWE categorization
- Prompt injection protection with 45+ detection patterns
- Input validation and sanitization using Zod schemas
- Rate limiting and HTTP security headers via Helmet
- **Boundary Daemon Integration**: Policy enforcement and audit logging
  - Environment monitoring (network, USB, processes)
  - Six boundary modes (OPEN, RESTRICTED, TRUSTED, AIRGAP, COLDROOM, LOCKDOWN)
  - Tamper-evident cryptographic audit trails
- **Boundary SIEM Integration**: Security event management and threat detection
  - Real-time event correlation with 103+ blockchain-specific detection rules
  - MITRE ATT&CK tactic/technique mapping
  - Multi-protocol alerting (webhooks, Slack, email)
  - Batch event submission with configurable flush intervals

#### Infrastructure
- Real-time WebSocket event streaming with authentication
- Health monitoring with Kubernetes-compatible probes
- Log rotation with daily archiving (Winston)
- Docker and Docker Compose support with multi-service orchestration
- CI/CD pipeline with GitHub Actions (lint, build, test matrix)
- Performance benchmarking suite

#### Developer Experience
- Comprehensive TypeScript types (~88KB of type definitions)
- CLI interface with init, start, and status commands
- Mock chain server for local development
- 200+ unit tests, 30+ integration tests
- ESLint with TypeScript rules and Husky pre-commit hooks

### Documentation
- Complete README with quick start and architecture overview
- Protocol specifications (MP-01 through MP-06)
- NCIP governance documents (NCIP-000 through NCIP-015)
- API reference with HTTP and WebSocket endpoints
- Operations runbook for production deployment
- Security hardening guide
- Architecture deep-dive
- Integration guide for multi-chain setups

### Security References
- [Boundary Daemon](https://github.com/kase1111-hash/boundary-daemon-) - Policy enforcement
- [Boundary SIEM](https://github.com/kase1111-hash/Boundary-SIEM) - Security event management

---

## Release Notes

### v0.1.0-alpha

This is the initial alpha release of the NatLangChain Mediator Node. It provides a fully functional mediation service with:

- Complete alignment cycle implementation (ingestion, mapping, negotiation, submission)
- All six protocol extensions (MP-01 through MP-06)
- Multiple consensus mode support
- Comprehensive security features including external security app integrations
- Production-ready infrastructure components

**Note**: This is an alpha release intended for testing and development. APIs and features may change before the stable v1.0.0 release.

### Known Issues
- Some test mocks require updates for axios timeout configuration
- Integration tests need mock chain running for full execution

### Upgrade Path
As this is the initial release, no upgrade path is required.
