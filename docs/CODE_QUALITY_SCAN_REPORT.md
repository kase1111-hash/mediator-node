# Code Quality Scan Report

**Date:** 2026-01-15
**Project:** mediator-node
**Status:** ALL VULNERABILITIES RESOLVED

## Summary

This report documents the results of running code quality and security scanning tools on the mediator-node codebase.

| Tool | Applicable | Issues Found | Status |
|------|------------|--------------|--------|
| vulture (Python unused code) | No | N/A - No Python files | N/A |
| autoflake (Python unused imports) | No | N/A - No Python files | N/A |
| pip-audit (Python vulnerabilities) | No | N/A - No Python files | N/A |
| depcheck (npm unused deps) | Yes | 5 issues | FIXED |
| npm audit (npm vulnerabilities) | Yes | 9 vulnerabilities | ALL FIXED |

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
| `diff` < 8.0.3 (DoS) | LOW (x8) | npm override to ^8.0.3 | FIXED |

### Solution for diff vulnerability

The `diff` package vulnerability was in the ts-node dependency chain. Since ts-node@10.9.2 pins `diff@^4.0.1`, we used npm's `overrides` feature to force the patched version:

```json
"overrides": {
  "diff": "^8.0.3"
}
```

This forces all nested `diff` dependencies to use the patched version without breaking compatibility.

---

## Final State

```
$ npm audit
found 0 vulnerabilities

$ npm run build
> tsc
(success)
```

**All vulnerabilities have been resolved.**
