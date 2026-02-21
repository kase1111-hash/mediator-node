# Agentic Security Audit Report

**Project:** NatLangChain Mediator Node (`mediator-node`)
**Version:** 0.2.0-alpha-focused
**Date:** 2026-02-21
**Auditor:** Automated Security Review (Claude)
**Framework:** [Agentic Security Audit v1](https://github.com/kase1111-hash/Claude-prompts/blob/main/Agentic-Security-Audit.md)

---

## Executive Summary

The mediator-node is a TypeScript/Node.js service that discovers, negotiates, and proposes alignments between explicit intents on the NatLangChain protocol. It interacts with an on-chain API, uses LLM providers (Anthropic/OpenAI) for semantic analysis, maintains a vector database for intent matching, and exposes health check HTTP endpoints.

**Overall Posture:** The project demonstrates strong security awareness with several defense-in-depth patterns already implemented. However, as an alpha-stage project with agentic LLM capabilities, there are critical gaps that must be addressed before production deployment.

### Score Summary

| Tier | Category | Score | Max | Status |
|------|----------|-------|-----|--------|
| 1.1 | Credential Storage | 7 | 10 | PASS (conditional) |
| 1.2 | Default-Deny Permissions | 5 | 10 | WARN |
| 1.3 | Cryptographic Agent Identity | 8 | 10 | PASS |
| 2.1 | Input Classification Gate | 7 | 10 | PASS |
| 2.2 | Memory Integrity & Provenance | 6 | 10 | WARN |
| 2.3 | Outbound Secret Scanning | 3 | 10 | FAIL |
| 2.4 | Skill/Module Signing & Sandboxing | 4 | 10 | WARN |
| 3.1 | Constitutional Audit Trail | 6 | 10 | WARN |
| 3.2 | Mutual Agent Authentication | 5 | 10 | WARN |
| 3.3 | Anti-C2 Pattern Enforcement | 4 | 10 | WARN |
| 3.4 | Vibe-Code Security Review Gate | 6 | 10 | WARN |
| 3.5 | Agent Coordination Boundaries | 5 | 10 | WARN |
| **Total** | | **66** | **120** | **55%** |

**Verdict:** The project needs remediation in several areas before production readiness. Tier 1 controls are mostly satisfactory, but Tier 2 and Tier 3 controls require additional implementation. The most urgent finding is the lack of outbound secret scanning on LLM prompts.

---

## Tier 1: Foundation Controls (Non-Negotiable)

### 1.1 Credential Storage — Score: 7/10 — PASS (conditional)

**What was found:**

- **`.env` excluded from version control:** `.gitignore` correctly excludes `.env` and `.env.local` (`.gitignore:3-4`).
- **`.env.example` uses placeholder values:** All secrets in `.env.example` use safe placeholders like `your-api-key-here` and `your-private-key-here`.
- **No real secrets in git history:** Scan of deleted files in git history found no leaked `.env`, `.pem`, or `.key` files.
- **Test files use obvious test keys:** All test files use clearly fake keys like `test-api-key`, `test-key`, etc.
- **ConfigLoader reads from environment only:** `src/config/ConfigLoader.ts` loads credentials exclusively from `process.env`.

**Issues:**

- **MEDIUM — Docker-compose hardcoded demo keys:** `docker-compose.yml:42-43` contains `MEDIATOR_PRIVATE_KEY=demo_private_key_for_testing_only`. While commented as demo-only, there is no runtime guard preventing these from being used accidentally in production. The `crypto.ts:45-47` production guard only triggers on PEM format check, not on the key value itself.
- **LOW — API keys passed as constructor arguments:** LLM API keys flow through `MediatorConfig.llmApiKey` as a plain string across multiple modules. While this is standard for Node.js applications, in-memory secret exposure should be considered.
- **LOW — No secret rotation mechanism:** No built-in support for rotating API keys or mediator keys at runtime.

**Recommendations:**

1. Add a startup check that rejects known demo/placeholder keys when `NODE_ENV=production`.
2. Consider integrating with a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) for production deployments.
3. Add runtime key rotation support or document the key rotation procedure.

---

### 1.2 Default-Deny Permissions — Score: 5/10 — WARN

**What was found:**

- **HealthServer has limited endpoints:** Only serves `/health`, `/health/live`, and `/health/ready` — returns 404 for unknown paths (`src/monitoring/HealthServer.ts:119-120`).
- **Mock chain server has rate limiting:** Uses `express-rate-limit` with general (1000/15m), write (100/15m), and admin (20/15m) tiers.
- **Mock chain server uses Helmet:** CSP, HSTS, X-Frame-Options, and X-XSS-Protection headers are configured (`examples/mock-chain/server.js:62-76`).
- **Zod schemas enforce data shapes:** Comprehensive runtime validation via `src/validation/schemas.ts`.
- **Input length validation:** Dedicated `src/validation/input-limits.ts` with explicit limits on all fields.

**Issues:**

- **HIGH — HealthServer binds to 0.0.0.0:** `src/monitoring/HealthServer.ts:39` defaults to `host: '0.0.0.0'`, which exposes the health endpoint to all network interfaces. An attacker on the same network could probe operational status.
- **HIGH — HealthServer has wildcard CORS:** `Access-Control-Allow-Origin: *` at `src/monitoring/HealthServer.ts:93` allows any origin to read health data, which could leak operational information.
- **MEDIUM — Admin endpoints on mock chain lack authentication:** `POST /admin/reset`, `/admin/mine`, etc. have rate limiting but no authentication. The `/admin/reset` endpoint (`examples/mock-chain/server.js:849`) does not even have the admin rate limiter applied.
- **MEDIUM — No request body size limit on core node:** While `INPUT_LIMITS.REQUEST_BODY_MAX` is defined as 1 MB, there's no evidence it's enforced at the HTTP level in the health server or any incoming WebSocket connections.
- **LOW — Overly permissive CORS on mock chain:** `app.use(cors())` at `examples/mock-chain/server.js:78` allows all origins.

**Recommendations:**

1. Bind HealthServer to `127.0.0.1` by default; require explicit opt-in for external binding.
2. Replace wildcard CORS with an allowlist of trusted origins.
3. Add authentication to admin endpoints (even in mock chain).
4. Enforce `REQUEST_BODY_MAX` at the HTTP middleware level.

---

### 1.3 Cryptographic Agent Identity — Score: 8/10 — PASS

**What was found:**

- **RSA-SHA256 asymmetric signing:** `src/utils/crypto.ts:33-57` implements proper asymmetric signing with PEM key detection.
- **Production enforcement:** The code throws an error if non-PEM keys are used in `NODE_ENV=production` (`crypto.ts:46-47`).
- **3072-bit RSA key generation:** `generateKeyPair()` uses NIST-recommended 3072-bit RSA (`crypto.ts:112`).
- **Timing-safe comparison:** HMAC verification in development mode uses `crypto.timingSafeEqual()` to prevent timing attacks (`crypto.ts:89-91`).
- **Settlement signing:** Settlements are cryptographically signed before chain submission (`src/settlement/SettlementManager.ts:72-77`).
- **Model integrity hashing:** `generateModelIntegrityHash()` creates SHA-256 hashes of model + prompt + version for reproducibility verification.

**Issues:**

- **MEDIUM — HMAC fallback uses same key for sign/verify:** In development mode, `generateSignature` and `verifySignature` both use the same key for HMAC operations (`crypto.ts:50, 86`). The `verifySignature` function uses the `publicKey` parameter as the HMAC secret, which means the "public" key must actually be the same secret as the "private" key. This conflation could cause confusion and incorrect usage.
- **LOW — No key expiration or revocation:** There is no mechanism to expire or revoke mediator keys.
- **LOW — Intent hashes use SHA-256 without salt:** `generateIntentHash` concatenates `prose:author:timestamp` without a random salt (`crypto.ts:18-20`). Predictable inputs could allow hash collision attacks.

**Recommendations:**

1. Add documentation clarifying that the HMAC fallback requires the same shared secret for both parties.
2. Consider adding a random nonce/salt to intent hash generation.
3. Implement key expiration metadata in the `MediatorConfig` type.

---

## Tier 2: Agentic-Specific Controls

### 2.1 Input Classification Gate — Score: 7/10 — PASS

**What was found:**

- **Prompt injection detection:** `src/utils/prompt-security.ts:13-45` defines comprehensive injection patterns covering:
  - Direct instruction overrides ("ignore previous instructions")
  - Role manipulation ("you are now admin")
  - System command tags (`[system]`, `<admin>`)
  - Jailbreak attempts (DAN mode, developer mode)
  - Truthfulness manipulation
  - Prompt termination markers
  - Instruction injection markers
- **Input sanitization pipeline:** `sanitizeForPrompt()` removes control characters, redacts injection patterns, escapes XML tags, and enforces length limits.
- **Structured prompt boundaries:** `buildStructuredPrompt()` uses XML-style tags to create clear semantic boundaries in LLM prompts, making it harder for injected content to escape the user-data section.
- **Intent-specific sanitization:** `sanitizeIntentForLLM()` is called in the negotiation flow (`src/llm/LLMProvider.ts:338-339`) to sanitize both intents before building the prompt.
- **Injection rate limiting:** `InjectionRateLimiter` class tracks repeated injection attempts per user and can block persistent attackers.
- **Prohibited content filtering:** `IntentIngester.isValidIntent()` at `src/ingestion/IntentIngester.ts:150-159` blocks intents containing coercive or illegal language.

**Issues:**

- **MEDIUM — Injection patterns are regex-only:** The detection relies entirely on pattern matching. Sophisticated obfuscation (Unicode homoglyphs, Base64 encoding, multi-language mixing) could bypass all patterns.
- **MEDIUM — Rate limiter not wired into main flow:** The `InjectionRateLimiter` class exists and has a global instance (`injectionRateLimiter`), but there is no evidence it is invoked in the `IntentIngester` or `LLMProvider` pipelines. An attacker could send unlimited injection attempts.
- **LOW — `generateSemanticSummary()` does not sanitize input:** `LLMProvider.generateSemanticSummary()` at line 453 passes `settlement.proposedTerms` directly to the LLM without sanitization. If terms contain injected content from a manipulated negotiation, it could influence the summary.
- **LOW — `generateText()` accepts raw prompts:** The general-purpose `generateText()` method at line 492 performs no input sanitization.

**Recommendations:**

1. Wire the `InjectionRateLimiter` into `IntentIngester.processIntent()` — record attempts when injection is detected and reject intents from rate-limited users.
2. Add LLM-based second-pass detection for sophisticated injection attempts (defense-in-depth).
3. Sanitize inputs to `generateSemanticSummary()` and `generateText()`.

---

### 2.2 Memory Integrity & Provenance — Score: 6/10 — WARN

**What was found:**

- **Intent cache with size enforcement:** `IntentIngester` enforces `maxIntentsCache` limit at `src/ingestion/IntentIngester.ts:241-260`, evicting oldest entries.
- **Embedding cache cleanup:** `MediatorNode.cleanupEmbeddingCache()` at line 480 removes stale embeddings.
- **Vector database with HNSW indexing:** Uses `hnswlib-node` for approximate nearest neighbor search, providing deterministic similarity results.
- **Model integrity hashing:** Each negotiation records the hash of the model + prompt template used, providing traceability.
- **Frozen item schemas:** `FrozenItemSchema` in `src/validation/schemas.ts:324-341` includes `mutationAttempts` tracking with audit fields.

**Issues:**

- **HIGH — No provenance tracking on cached intents:** When intents are ingested from the chain, there is no cryptographic verification that the intent data hasn't been tampered with in transit. The `ChainClient` trusts all responses from the chain API.
- **MEDIUM — Embedding cache has no integrity verification:** The `embeddingCache` Map in `MediatorNode` stores raw vectors without hashing. A corrupted or manipulated embedding could silently alter alignment results.
- **MEDIUM — LLM response parsing trusts output:** `parseNegotiationResponse()` at `src/llm/LLMProvider.ts:400-448` parses LLM output with regex without verifying that the structured output matches expected patterns. A manipulated LLM response could inject unexpected terms.
- **LOW — Settlement terms parsed from JSON without validation:** At line 420, `JSON.parse(termsMatch[1])` parses proposed terms from the LLM response without running them through the `ProposedTermsSchema` validator.

**Recommendations:**

1. Verify chain response integrity by checking entry signatures when available.
2. Hash embeddings and verify before use in alignment calculations.
3. Validate parsed LLM output against `ProposedTermsSchema` before creating settlements.
4. Add a data provenance header to all cached items tracking source and timestamp.

---

### 2.3 Outbound Secret Scanning — Score: 3/10 — FAIL

**What was found:**

- **No outbound secret scanning implemented.** This is the most critical gap in the security posture.

**Issues:**

- **CRITICAL — API keys could leak through LLM prompts:** The LLM provider sends prompts containing user-generated intent data to external APIs (Anthropic, OpenAI, Cohere, Voyage). There is no scanning to ensure that secrets accidentally included in intent prose (e.g., API keys, private keys, PII) are not sent to third-party LLM providers.
- **CRITICAL — No egress filtering on chain submissions:** Data submitted to the chain via `ChainClient.submitEntry()` is broadcast publicly. If a settlement's reasoning trace or proposed terms accidentally contain sensitive data, it would be permanently recorded on-chain.
- **HIGH — Logging may capture secrets:** The Winston logger (`src/utils/logger.ts`) logs structured data to rotating files. There is no redaction filter to prevent secrets from being written to log files. Error logs at `ChainClient.ts:95-100` include full request URLs and error messages which could contain tokens.
- **MEDIUM — Error stack traces may leak paths and config:** Error logging throughout the codebase logs full stack traces (e.g., `MediatorNode.ts:168, IntentIngester.ts:33`), which could reveal internal paths and configuration details.

**Recommendations:**

1. **Implement an outbound scanning middleware** that checks all data before it is sent to external APIs (LLM providers, chain). Scan for patterns matching:
   - API key formats (`sk-...`, `key-...`, bearer tokens)
   - PEM-formatted keys
   - Email addresses and PII patterns
   - Environment variable values from the current config
2. **Add a log redaction transport** to Winston that strips secrets from all log output.
3. **Review and redact chain-bound data** before submission — strip anything that isn't required by the protocol.

---

### 2.4 Skill/Module Signing & Sandboxing — Score: 4/10 — WARN

**What was found:**

- **LLM provider abstraction:** `LLMProvider` class provides a controlled interface for LLM access, limiting what operations can be performed.
- **Zod schema validation:** All data structures are validated at boundaries using Zod schemas in `src/validation/schemas.ts`.
- **Safe file operations:** `src/validation/safe-file-ops.ts` provides path traversal protection with `validatePathWithinDirectory()` and `sanitizeFilename()`.
- **Path traversal protection:** `SafeIDSchema` validates IDs to prevent path traversal (`schemas.ts:393`).

**Issues:**

- **HIGH — LLM responses are not sandboxed:** The LLM can return arbitrary JSON in `PROPOSED_TERMS` that gets parsed and passed through the system. While the `JSON.parse()` at `LLMProvider.ts:420` is caught in a try/catch, the parsed object is used directly without schema validation.
- **MEDIUM — No module integrity verification:** There is no mechanism to verify the integrity of loaded modules at startup. A supply chain attack modifying `node_modules` dependencies would not be detected.
- **MEDIUM — Custom LLM provider support:** The `custom` LLM provider type is accepted in config (`ConfigLoader.ts:141`) but has no implementation constraints or sandboxing for what a custom provider could do.
- **LOW — `husky` and `lint-staged` for pre-commit:** Good practice for catching issues before commit, but no security-specific linting rules detected.

**Recommendations:**

1. Validate all LLM-parsed output against Zod schemas (`ProposedTermsSchema`) before passing through the system.
2. Add `npm audit` to the CI pipeline (`ci.yml`) to catch known dependency vulnerabilities.
3. Consider implementing `npm` lockfile integrity checking in CI.
4. Add security-specific ESLint rules (e.g., `eslint-plugin-security`).

---

## Tier 3: Advanced & Ecosystem Controls

### 3.1 Constitutional Audit Trail — Score: 6/10 — WARN

**What was found:**

- **Structured logging with Winston:** All operations are logged with structured metadata including timestamps, service name, and operation-specific fields.
- **Daily rotating log files:** Error and combined logs rotate daily with retention (14 days for errors, 7 days for combined) at `src/utils/logger.ts:13-34`.
- **Audit logging in mock chain:** HTTP request audit logging at `examples/mock-chain/server.js:83-95` records IP, user-agent, method, path, status, and duration.
- **Challenge detection logging:** Security-relevant events like prompt injection detection, challenge submissions, and settlement closures are logged with appropriate severity levels.
- **Model integrity hashing:** Each negotiation records a `modelIntegrityHash` enabling reproducibility verification.
- **Boundary Daemon/SIEM integration:** `.env.example` shows configuration support for external security monitoring via `BOUNDARY_DAEMON_*` and `BOUNDARY_SIEM_*` settings.

**Issues:**

- **MEDIUM — No log integrity protection:** Log files are plain text/JSON with no cryptographic integrity protection. An attacker with filesystem access could modify or delete logs without detection.
- **MEDIUM — No centralized security event stream:** Security events (injection attempts, challenge submissions, rate limit triggers) are mixed into general application logs. There is no dedicated security audit log or SIEM integration in the core codebase (only configuration placeholders).
- **LOW — Insufficient audit coverage:** Some security-critical operations lack audit logging — e.g., `ChainClient.submitEntry()` does not log the full content being submitted, and `crypto.generateSignature()` does not log signing operations.
- **LOW — Log retention may be insufficient:** 7 days for combined logs may be too short for forensic analysis in dispute resolution scenarios (settlements have a 72-hour acceptance window).

**Recommendations:**

1. Implement the Boundary SIEM integration that is already configured in `.env.example`.
2. Add HMAC signing to log entries for tamper detection.
3. Create a dedicated security audit log transport that captures all security-relevant events.
4. Extend combined log retention to at least 30 days, or match the maximum dispute resolution period.

---

### 3.2 Mutual Agent Authentication — Score: 5/10 — WARN

**What was found:**

- **Settlement signing with private keys:** Settlements are signed using RSA-SHA256 (or PoA authority key) before chain submission at `src/settlement/SettlementManager.ts:72-77`.
- **WebSocket authentication schema:** `AuthenticationMessageSchema` at `src/validation/schemas.ts:201-206` defines identity, signature, timestamp, and nonce fields for WebSocket authentication.
- **Chain entry signatures:** All chain entries can include signatures (`ChainClient.ts:627-629`).
- **Challenge entries are signed:** `ChainClient.submitChallenge()` at line 625 signs challenge content before submission.

**Issues:**

- **HIGH — No incoming signature verification in main flow:** While signatures are generated for outgoing data, the `IntentIngester` does not verify signatures on incoming intents from the chain. The `processIntent()` method at `IntentIngester.ts:96-135` checks structure and content but not cryptographic authenticity.
- **HIGH — Chain client trusts all responses:** `ChainClient` treats all HTTP responses from the chain endpoint as authentic. A man-in-the-middle on the `CHAIN_ENDPOINT` connection could feed the mediator fabricated intents.
- **MEDIUM — No TLS enforcement:** The chain endpoint is configured via `CHAIN_ENDPOINT` env var and defaults to `http://localhost:8545` (plain HTTP). There is no validation that production endpoints use HTTPS.
- **MEDIUM — WebSocket authentication schema exists but no implementation:** The `AuthenticationMessageSchema` is defined but there is no WebSocket server or client implementation in the current source tree that uses it.

**Recommendations:**

1. Verify signatures on incoming chain entries where available.
2. Enforce HTTPS for chain endpoints in production (`NODE_ENV=production`).
3. Implement mutual TLS or API token authentication for chain communication.
4. Implement the WebSocket authentication flow using the existing schema.

---

### 3.3 Anti-C2 (Command & Control) Pattern Enforcement — Score: 4/10 — WARN

**What was found:**

- **Circuit breaker pattern:** `src/utils/circuit-breaker.ts` implements a circuit breaker that prevents cascading failures when the chain is unavailable, and could help limit the blast radius of a compromised chain endpoint.
- **Rate limiting on mock chain:** Write operations are rate-limited (100/15m), admin operations are further restricted (20/15m).
- **Intent content filtering:** Basic prohibited content checks in `IntentIngester.isValidIntent()`.

**Issues:**

- **HIGH — No outbound request rate limiting on LLM calls:** The `LLMProvider` has no rate limiting on API calls to external LLM providers. A flood of intents could cause unbounded spending on LLM API calls. The alignment cycle processes up to 3 candidates per cycle (`MediatorNode.ts:267`), but the cycle interval is configurable and there's no spending cap.
- **HIGH — No allowlist/blocklist for chain endpoints:** The mediator trusts whatever `CHAIN_ENDPOINT` is configured. If this is compromised (e.g., via environment variable injection), the mediator could be redirected to a malicious endpoint that feeds it crafted intents designed to trigger specific LLM behaviors.
- **MEDIUM — No anomaly detection on intent patterns:** There is no detection of unusual patterns like sudden spikes in intents from a single author, identical intents submitted repeatedly, or coordinated intent submissions designed to drain mediator resources.
- **MEDIUM — Settlement monitoring has no circuit breaker:** The `monitorSettlements()` loop at `SettlementManager.ts:118` makes chain API calls without circuit breaker protection, unlike the retry-wrapped calls in `ChainClient`.

**Recommendations:**

1. Add an LLM spending cap (max API calls per hour/day) to prevent runaway costs.
2. Implement anomaly detection on ingested intents (frequency, patterns, author clustering).
3. Add chain endpoint allowlisting or certificate pinning.
4. Wrap settlement monitoring calls in circuit breaker protection.

---

### 3.4 Vibe-Code Security Review Gate — Score: 6/10 — WARN

**What was found:**

- **CI pipeline with lint + build + test:** `.github/workflows/ci.yml` runs ESLint, TypeScript compilation, and Jest tests on push/PR to `main`/`master`.
- **Multi-version testing:** Tests run on Node.js 18 and 20.
- **Pre-commit hooks with husky:** `package.json:74-78` configures `lint-staged` to run ESLint on all TypeScript files before commit.
- **Comprehensive test suite:** Tests cover ConfigLoader, LLMProvider, VectorDatabase, IntentIngester, ChallengeDetector, ChallengeManager, ChainClient, and integration lifecycle tests.
- **Zod runtime validation:** Type-safe runtime validation at all data boundaries.

**Issues:**

- **MEDIUM — No security scanning in CI:** The CI pipeline has no dependency vulnerability scanning (`npm audit`), no SAST tools, and no secret detection scanning.
- **MEDIUM — No test for prompt injection defenses:** While `prompt-security.ts` has patterns defined, the test baseline (`test_baseline.txt`) mentions detecting `eval()` and `new Function()` usage but doesn't show dedicated tests for the prompt injection detection patterns.
- **LOW — No Docker image scanning:** Dockerfiles exist but CI doesn't build or scan Docker images.
- **LOW — Coverage threshold not enforced:** The CI uploads coverage reports but doesn't enforce minimum coverage thresholds.

**Recommendations:**

1. Add `npm audit --audit-level=high` as a required CI step.
2. Add a SAST tool (e.g., `semgrep`, `codeql`) to the CI pipeline.
3. Add secret scanning (e.g., `trufflehog`, `gitleaks`) to CI.
4. Add comprehensive tests for all prompt injection patterns in `prompt-security.ts`.
5. Enforce minimum test coverage thresholds.

---

### 3.5 Agent Coordination Boundaries — Score: 5/10 — WARN

**What was found:**

- **Clear module boundaries:** The codebase follows a clean separation of concerns — `IntentIngester`, `VectorDatabase`, `LLMProvider`, `SettlementManager`, `ChallengeManager`, and `ReputationTracker` each have distinct responsibilities.
- **ChainClient as single point of chain access:** All chain communication goes through `ChainClient`, providing a single chokepoint for monitoring and control.
- **Challenge system for cross-mediator verification:** The `ChallengeDetector` and `ChallengeManager` system allows mediators to verify and challenge each other's settlements, providing a form of multi-agent accountability.
- **Configurable consensus modes:** The system supports permissionless, DPoS, PoA, and hybrid consensus, providing different trust levels for different deployment scenarios.

**Issues:**

- **HIGH — No privilege separation between components:** All components run in the same process with full access to the `MediatorConfig` (which contains the private key). A vulnerability in any component (e.g., the health server) could expose the private key.
- **MEDIUM — No resource quotas per operation:** Individual alignment cycles, negotiations, or chain queries have no resource quotas (CPU time, memory, network calls). A single complex negotiation could consume excessive resources.
- **MEDIUM — Deferred modules lack security review:** The `_deferred/` directory contains substantial code for consensus, networking, disputes, licensing, and settlements that appear to be in-progress features. These modules have not been reviewed for security implications but may be enabled in future releases.
- **LOW — No capability-based access control:** All internal components can access all methods of all other components. There is no internal capability or permission system.

**Recommendations:**

1. Consider running the health server in a separate process or with reduced privileges.
2. Implement per-operation timeouts and resource quotas.
3. Establish a security review gate for promoting deferred modules to active.
4. Consider a capability-based internal architecture where components only receive the interfaces they need.

---

## Dockerfile & Container Security

### Findings

**Strengths:**
- Uses `node:18-alpine` (minimal base image).
- `npm ci` for deterministic installs.
- `npm prune --production` to remove dev dependencies.
- Separate `Dockerfile.dev` for development.

**Issues:**

- **MEDIUM — Container runs as root:** The Dockerfile does not include a `USER` directive. The application runs as root inside the container, increasing the blast radius of any container escape vulnerability.
- **LOW — No multi-stage build:** The build dependencies (`python3 make g++`) remain in the final image even though they're only needed for native module compilation.
- **LOW — No health check in Dockerfile:** While `docker-compose.yml` defines health checks for the mock chain, the mediator node Dockerfile itself doesn't include a `HEALTHCHECK` instruction.

**Recommendations:**

1. Add a non-root user: `RUN adduser -D appuser && USER appuser`.
2. Use a multi-stage build to eliminate build dependencies from the final image.
3. Add `HEALTHCHECK` instruction to the Dockerfile.

---

## Critical Findings Summary

### Priority 1 (Address Immediately)

| # | Finding | Location | Severity |
|---|---------|----------|----------|
| 1 | **No outbound secret scanning** — API keys, PII, or credentials in intent data could leak to LLM providers and on-chain | `src/llm/LLMProvider.ts`, `src/chain/ChainClient.ts` | CRITICAL |
| 2 | **LLM response terms not validated** — Parsed JSON from LLM output used without schema validation | `src/llm/LLMProvider.ts:420` | HIGH |
| 3 | **No incoming signature verification** — Chain responses trusted without cryptographic verification | `src/ingestion/IntentIngester.ts:96` | HIGH |
| 4 | **No LLM spending cap** — Unbounded LLM API call spend possible | `src/llm/LLMProvider.ts` | HIGH |
| 5 | **HealthServer binds to 0.0.0.0 with wildcard CORS** | `src/monitoring/HealthServer.ts:39,93` | HIGH |

### Priority 2 (Address Before Production)

| # | Finding | Location | Severity |
|---|---------|----------|----------|
| 6 | No TLS enforcement for chain endpoints | `src/config/ConfigLoader.ts` | MEDIUM |
| 7 | Injection rate limiter not wired into main flow | `src/utils/prompt-security.ts:341` | MEDIUM |
| 8 | Container runs as root | `Dockerfile` | MEDIUM |
| 9 | No `npm audit` or SAST in CI | `.github/workflows/ci.yml` | MEDIUM |
| 10 | Log files lack integrity protection | `src/utils/logger.ts` | MEDIUM |
| 11 | No anomaly detection on intent ingestion patterns | `src/ingestion/IntentIngester.ts` | MEDIUM |
| 12 | Admin endpoints lack authentication | `examples/mock-chain/server.js:849` | MEDIUM |

### Priority 3 (Improve Over Time)

| # | Finding | Location | Severity |
|---|---------|----------|----------|
| 13 | No key expiration/rotation mechanism | `src/utils/crypto.ts` | LOW |
| 14 | Error logs may leak paths and configuration | Multiple files | LOW |
| 15 | Combined log retention too short (7 days) | `src/utils/logger.ts:33` | LOW |
| 16 | Intent hashes lack random salt | `src/utils/crypto.ts:18` | LOW |

---

## Positive Security Patterns Observed

The following security patterns are implemented well and should be maintained:

1. **Prompt injection defense-in-depth** (`src/utils/prompt-security.ts`) — Comprehensive pattern detection, input sanitization, XML escaping, structured prompt boundaries, and rate limiting infrastructure.
2. **Zod schema validation** (`src/validation/schemas.ts`) — Thorough runtime type validation with explicit length limits on all string fields.
3. **Path traversal protection** (`src/validation/safe-file-ops.ts`) — Directory containment checks, filename sanitization, and double-validation on generated paths.
4. **Circuit breaker pattern** (`src/utils/circuit-breaker.ts`) — Well-implemented circuit breaker preventing cascading failures.
5. **Cryptographic signing** (`src/utils/crypto.ts`) — Proper asymmetric crypto with production enforcement, timing-safe comparison, and NIST-compliant key sizes.
6. **Boundary daemon/SIEM configuration** (`.env.example`) — Infrastructure for external security monitoring is pre-configured.
7. **Challenge system** — Cross-mediator verification mechanism provides multi-agent accountability.

---

## Conclusion

The mediator-node project shows strong security awareness for an alpha-stage project. The foundation controls (credential management, cryptographic identity) are mostly solid. The agentic-specific controls (prompt injection defense, input validation) show thoughtful implementation but have gaps in enforcement. The most critical deficiency is the complete absence of outbound secret scanning, which creates a risk of credential leakage through LLM API calls and chain submissions.

The project has good infrastructure for security (Boundary Daemon/SIEM configuration, prompt security utilities, rate limiter classes) that is not yet fully wired into the operational flow. Completing these integrations would significantly improve the security posture.

**Next steps:**
1. Implement outbound secret scanning (Priority 1, Finding #1)
2. Validate LLM output against Zod schemas (Priority 1, Finding #2)
3. Wire the injection rate limiter into the intent processing pipeline (Priority 2, Finding #7)
4. Add security scanning to CI (Priority 2, Finding #9)
5. Implement the Boundary SIEM integration
