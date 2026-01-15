# Code Quality Scan Report

**Date:** 2026-01-15
**Project:** mediator-node
**Status:** REMEDIATED

## Summary

This report documents the results of running code quality and security scanning tools on the mediator-node codebase.

| Tool | Applicable | Issues Found | Status |
|------|------------|--------------|--------|
| vulture (Python unused code) | No | N/A - No Python files | N/A |
| autoflake (Python unused imports) | No | N/A - No Python files | N/A |
| pip-audit (Python vulnerabilities) | No | N/A - No Python files | N/A |
| depcheck (npm unused deps) | Yes | 5 issues | FIXED |
| npm audit (npm vulnerabilities) | Yes | 9 vulnerabilities | FIXED (1 HIGH resolved) |

---

## Python Tools (vulture, autoflake, pip-audit)

**Status:** Not Applicable

This is a pure Node.js/TypeScript project with no Python files. Python-specific scanning tools (vulture, autoflake, pip-audit) are not applicable.

---

## depcheck - Unused npm Dependencies

### Remediation Actions Taken

| Issue | Action | Status |
|-------|--------|--------|
| `helmet` unused | Removed from dependencies | FIXED |
| `@jest/globals` missing | Added to devDependencies | FIXED |
| `express-rate-limit` flagged | Kept - used in `examples/mock-chain/server.js` | FALSE POSITIVE |

### Remaining False Positives (No Action Required)

| Package | Reason for Keeping |
|---------|-------------------|
| `express-rate-limit` | Used in `examples/mock-chain/server.js` |
| `@types/jest` | Provides Jest type definitions |
| `@typescript-eslint/eslint-plugin` | Used by eslint.config.mjs |
| `@typescript-eslint/parser` | Used by eslint.config.mjs |

---

## npm audit - Vulnerability Scan

### Remediation Actions Taken

| Vulnerability | Severity | Action | Status |
|---------------|----------|--------|--------|
| `qs` < 6.14.1 (DoS) | HIGH | `npm audit fix` | FIXED |
| `diff` < 8.0.3 (DoS) | LOW | Accepted risk (dev-only) | DEFERRED |

### Remaining Vulnerabilities (8 LOW)

All remaining vulnerabilities are in the **development dependency chain** only:

```
diff -> ts-node -> jest-config -> jest -> ts-jest
```

- **Impact:** Development/testing environment only, not production
- **Risk:** Low - requires parsing malicious patch files
- **Fix available:** `npm audit fix --force` (breaking change - downgrades ts-node)
- **Recommendation:** Monitor for non-breaking fix; acceptable risk for dev dependencies

---

## Final State

```
$ npm audit
8 low severity vulnerabilities

$ npx depcheck
Unused dependencies: express-rate-limit (false positive - used in examples)
Unused devDependencies: @types/jest, @typescript-eslint/* (false positives)
```

All actionable issues have been resolved. Remaining items are either false positives or accepted low-risk dev dependencies.
