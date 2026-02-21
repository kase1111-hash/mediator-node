/**
 * Outbound Secret Scanner
 *
 * Scans outbound data (LLM prompts, chain submissions, log entries) for
 * accidentally included secrets such as API keys, PEM keys, PII, and
 * config values. Prevents credential leakage to external services.
 */

import { logger } from './logger';

/**
 * Secret pattern definitions with human-readable labels
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // API key formats
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI/Anthropic API key' },
  { pattern: /key-[a-zA-Z0-9]{20,}/g, label: 'Generic API key' },
  { pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/g, label: 'Bearer token' },
  { pattern: /xox[bpas]-[a-zA-Z0-9-]{10,}/g, label: 'Slack token' },
  { pattern: /ghp_[a-zA-Z0-9]{36,}/g, label: 'GitHub PAT' },
  { pattern: /gho_[a-zA-Z0-9]{36,}/g, label: 'GitHub OAuth token' },

  // PEM-formatted keys
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g, label: 'PEM private key' },
  { pattern: /-----BEGIN\s+CERTIFICATE-----[\s\S]*?-----END\s+CERTIFICATE-----/g, label: 'PEM certificate' },

  // Common PII patterns
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: 'Email address' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'SSN-like pattern' },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, label: 'Credit card number' },

  // AWS credentials
  { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key' },

  // Generic long secrets (hex or base64 that look like keys)
  { pattern: /(?:api[_-]?key|secret|token|password|passwd|credentials?)\s*[:=]\s*['"]?[a-zA-Z0-9/+=]{20,}['"]?/gi, label: 'Inline secret assignment' },
];

export interface ScanResult {
  found: boolean;
  matches: Array<{ label: string; redacted: string }>;
}

/**
 * Scan text for potential secrets
 *
 * @param text - Text to scan
 * @param configValues - Optional array of known config values to check for literal matches
 * @returns Scan result indicating whether secrets were found
 */
export function scanForSecrets(text: string, configValues?: string[]): ScanResult {
  const matches: Array<{ label: string; redacted: string }> = [];

  // Check regex patterns
  for (const { pattern, label } of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) {
      for (const match of found) {
        matches.push({
          label,
          redacted: match.slice(0, 6) + '...[REDACTED]',
        });
      }
    }
  }

  // Check for literal config values
  if (configValues) {
    for (const value of configValues) {
      // Only check values that look like secrets (long enough, not common words)
      if (value && value.length >= 16 && text.includes(value)) {
        matches.push({
          label: 'Config value literal match',
          redacted: value.slice(0, 4) + '...[REDACTED]',
        });
      }
    }
  }

  return {
    found: matches.length > 0,
    matches,
  };
}

/**
 * Redact secrets from text, replacing them with [REDACTED]
 *
 * @param text - Text to redact secrets from
 * @returns Text with secrets replaced by [REDACTED]
 */
export function redactSecrets(text: string): string {
  let redacted = text;

  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, '[REDACTED]');
  }

  return redacted;
}

/**
 * Scan outbound data and log warnings if secrets are detected.
 * Throws an error if secrets are found (preventing the outbound call).
 *
 * @param text - Outbound text to scan
 * @param context - Context description for logging (e.g., 'LLM prompt', 'chain submission')
 * @param configValues - Optional config values to check for literal leakage
 * @throws Error if secrets are detected
 */
export function assertNoSecrets(
  text: string,
  context: string,
  configValues?: string[]
): void {
  const result = scanForSecrets(text, configValues);

  if (result.found) {
    logger.error('Outbound secret detected — blocking transmission', {
      context,
      matchCount: result.matches.length,
      matchLabels: result.matches.map(m => m.label),
      security: true,
    });

    throw new Error(
      `Outbound secret scan failed for ${context}: ` +
      `found ${result.matches.length} potential secret(s). Transmission blocked.`
    );
  }
}
