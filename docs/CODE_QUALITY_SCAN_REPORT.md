# Code Quality Scan Report

**Date:** 2026-01-15
**Project:** mediator-node

## Summary

This report documents the results of running code quality and security scanning tools on the mediator-node codebase.

| Tool | Applicable | Issues Found |
|------|------------|--------------|
| vulture (Python unused code) | No | N/A - No Python files |
| autoflake (Python unused imports) | No | N/A - No Python files |
| pip-audit (Python vulnerabilities) | No | N/A - No Python files |
| depcheck (npm unused deps) | Yes | 5 issues |
| npm audit (npm vulnerabilities) | Yes | 9 vulnerabilities |

---

## Python Tools (vulture, autoflake, pip-audit)

**Status:** Not Applicable

This is a pure Node.js/TypeScript project with no Python files. Python-specific scanning tools (vulture, autoflake, pip-audit) are not applicable.

---

## depcheck - Unused npm Dependencies

### Unused Dependencies (Production)
These packages are listed in `dependencies` but not used in the codebase:

| Package | Recommendation |
|---------|----------------|
| `express-rate-limit` | Remove or implement rate limiting |
| `helmet` | Remove or implement security headers |

### Unused DevDependencies
These packages are listed in `devDependencies` but not detected in use:

| Package | Notes |
|---------|-------|
| `@types/jest` | May be needed for Jest typing (false positive) |
| `@typescript-eslint/eslint-plugin` | Used by eslint config |
| `@typescript-eslint/parser` | Used by eslint config |

> **Note:** Some devDependencies may show as unused due to indirect usage through config files. Review before removing.

### Missing Dependencies
Dependencies used in code but not listed in package.json:

| Package | Used In |
|---------|---------|
| `@jest/globals` | `./test/websocket/AuthenticationService.test.ts` |

---

## npm audit - Vulnerability Scan

**Total Vulnerabilities: 9** (8 low, 1 high)

### HIGH Severity

#### qs < 6.14.1
- **Advisory:** [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p)
- **Issue:** arrayLimit bypass in bracket notation allows DoS via memory exhaustion
- **CVSS Score:** 7.5
- **Fix:** `npm audit fix` (non-breaking)

### LOW Severity

#### diff < 8.0.3
- **Advisory:** [GHSA-73rr-hh4g-fpgx](https://github.com/advisories/GHSA-73rr-hh4g-fpgx)
- **Issue:** Denial of Service vulnerability in parsePatch and applyPatch
- **Affected Chain:** diff -> ts-node -> jest-config -> jest
- **Fix:** `npm audit fix --force` (breaking change - downgrades ts-node to 1.7.1)

---

## Recommendations

### Immediate Actions (Priority 1)
1. **Fix HIGH vulnerability:** Run `npm audit fix` to update `qs` package

### Short-term Actions (Priority 2)
2. **Add missing dependency:** `npm install --save-dev @jest/globals`
3. **Review unused production dependencies:**
   - If rate limiting/security headers are planned features, keep `express-rate-limit` and `helmet`
   - If not needed, remove with: `npm uninstall express-rate-limit helmet`

### Long-term Actions (Priority 3)
4. **Monitor LOW vulnerabilities:** The `diff` package vulnerability is in the dev dependency chain (jest/ts-node). Evaluate if major version upgrades are feasible.
5. **Do NOT remove eslint-related devDependencies** - they are used indirectly through eslint config

---

## Commands Reference

```bash
# Fix high severity vulnerability (safe)
npm audit fix

# Fix all vulnerabilities (may introduce breaking changes)
npm audit fix --force

# Add missing dependency
npm install --save-dev @jest/globals

# Remove unused production dependencies (if confirmed unused)
npm uninstall express-rate-limit helmet

# Re-run scans
npx depcheck
npm audit
```
