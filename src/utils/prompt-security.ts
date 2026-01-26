/**
 * LLM Prompt Security Utilities
 *
 * Provides protection against prompt injection attacks by sanitizing user inputs
 * and detecting common injection patterns.
 */

import { logger } from './logger';

/**
 * Common prompt injection patterns
 */
const INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,

  // Role manipulation
  /you\s+are\s+(now|actually)\s+(a|an|the)\s+(admin|administrator|system|root|developer|god)/gi,
  /your\s+(new|actual)\s+role\s+is/gi,
  /act\s+as\s+(if|though)\s+you\s+(are|were)\s+(admin|system)/gi,

  // System commands
  /\[(system|admin|root|sudo|override|bypass|debug|dev)\]/gi,
  /<(system|admin|override|bypass)>/gi,

  // Jailbreak attempts
  /DAN\s+mode/gi,
  /developer\s+mode/gi,
  /god\s+mode/gi,
  /jailbreak/gi,

  // Direct truthfulness manipulation
  /always\s+(say|respond|return|output)\s+(yes|true|success|approved)/gi,
  /never\s+(say|respond|return|output)\s+(no|false|fail|reject)/gi,

  // Prompt termination
  /---+\s*end\s+of\s+(prompt|instructions)/gi,
  /\[end\s+of\s+(prompt|context|instructions)\]/gi,

  // Instruction injection markers
  /new\s+(instructions|prompt|task|objective):/gi,
  /\/\s*system/gi,
];

/**
 * Detect potential prompt injection attempts
 *
 * @param text - User input to check
 * @returns true if injection patterns detected
 */
export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize text for safe inclusion in LLM prompts
 *
 * Removes or escapes potentially dangerous content while preserving legitimate text.
 *
 * @param text - User input to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text
 */
export function sanitizeForPrompt(
  text: string,
  options: {
    maxLength?: number;
    removeControlChars?: boolean;
    escapeXml?: boolean;
    redactInjection?: boolean;
  } = {}
): string {
  const {
    maxLength = 5000,
    removeControlChars = true,
    escapeXml = true,
    redactInjection = true,
  } = options;

  let sanitized = text;

  // Remove control characters (except newlines and tabs)
  if (removeControlChars) {
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  // Redact injection patterns
  if (redactInjection) {
    INJECTION_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
  }

  // Escape XML/HTML-like tags if using structured prompts
  if (escapeXml) {
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Enforce length limit
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '... [truncated]';
  }

  return sanitized.trim();
}

/**
 * Sanitize an array of strings (e.g., desires, constraints)
 *
 * @param items - Array of strings to sanitize
 * @param maxLength - Maximum length per item
 * @returns Sanitized array
 */
export function sanitizeArray(items: string[], maxLength: number = 500): string[] {
  return items.map((item) =>
    sanitizeForPrompt(item, {
      maxLength,
      removeControlChars: true,
      escapeXml: true,
      redactInjection: true,
    })
  );
}

/**
 * Build a structured prompt with clear delimiters
 *
 * Uses XML-style tags to create clear boundaries that are harder to escape.
 *
 * @param sections - Prompt sections with names and content
 * @returns Structured prompt string
 */
export function buildStructuredPrompt(sections: Record<string, string>): string {
  const parts: string[] = [];

  for (const [name, content] of Object.entries(sections)) {
    parts.push(`<${name}>`);
    parts.push(content);
    parts.push(`</${name}>`);
    parts.push(''); // blank line
  }

  return parts.join('\n');
}

/**
 * Validate user input before LLM processing
 *
 * Checks for injection attempts and logs suspicious activity.
 *
 * @param text - User input to validate
 * @param context - Context information for logging
 * @returns Validation result
 */
export function validateLLMInput(
  text: string,
  context: {
    userId?: string;
    intentId?: string;
    field?: string;
  } = {}
): { valid: boolean; sanitized: string; detected?: string[] } {
  const detected: string[] = [];

  // Check each pattern
  for (const pattern of INJECTION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      detected.push(...matches);
    }
  }

  if (detected.length > 0) {
    logger.warn('Prompt injection attempt detected', {
      context,
      detected: detected.slice(0, 5), // Log first 5 matches
      textLength: text.length,
    });
  }

  const sanitized = sanitizeForPrompt(text);

  return {
    valid: detected.length === 0,
    sanitized,
    detected: detected.length > 0 ? detected : undefined,
  };
}

/**
 * Sanitize Intent fields for LLM processing
 *
 * Specialized sanitization for Intent objects used in negotiations.
 *
 * @param intent - Intent object with potentially unsafe fields
 * @returns Sanitized intent data
 */
export function sanitizeIntentForLLM(intent: {
  prose: string;
  desires: string[];
  constraints: string[];
  author: string;
  [key: string]: any;
}): {
  prose: string;
  desires: string[];
  constraints: string[];
  author: string;
  warnings?: string[];
} {
  const warnings: string[] = [];

  // Validate prose
  const proseValidation = validateLLMInput(intent.prose, {
    userId: intent.author,
    field: 'prose',
  });

  if (!proseValidation.valid) {
    warnings.push('Injection attempt in prose');
  }

  // Sanitize desires
  const desires = intent.desires || [];
  desires.forEach((desire, index) => {
    const validation = validateLLMInput(desire, {
      userId: intent.author,
      field: `desires[${index}]`,
    });
    if (!validation.valid) {
      warnings.push(`Injection attempt in desires[${index}]`);
    }
  });

  // Sanitize constraints
  const constraints = intent.constraints || [];
  constraints.forEach((constraint, index) => {
    const validation = validateLLMInput(constraint, {
      userId: intent.author,
      field: `constraints[${index}]`,
    });
    if (!validation.valid) {
      warnings.push(`Injection attempt in constraints[${index}]`);
    }
  });

  return {
    prose: proseValidation.sanitized,
    desires: sanitizeArray(desires),
    constraints: sanitizeArray(constraints),
    author: intent.author,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Rate limiter for injection attempts
 *
 * Tracks users with repeated injection attempts for blocking.
 */
export class InjectionRateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 3600000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Clean up old entries every hour
    setInterval(() => this.cleanup(), 3600000);
  }

  /**
   * Record an injection attempt
   */
  recordAttempt(userId: string): void {
    const now = Date.now();
    const userAttempts = this.attempts.get(userId) || [];

    // Add new attempt
    userAttempts.push(now);

    // Keep only recent attempts
    const recentAttempts = userAttempts.filter((time) => now - time < this.windowMs);
    this.attempts.set(userId, recentAttempts);

    if (recentAttempts.length >= this.maxAttempts) {
      logger.error('User exceeded injection attempt limit', {
        userId,
        attempts: recentAttempts.length,
        window: this.windowMs,
      });
    }
  }

  /**
   * Check if user is rate limited
   */
  isLimited(userId: string): boolean {
    const userAttempts = this.attempts.get(userId) || [];
    const now = Date.now();
    const recentAttempts = userAttempts.filter((time) => now - time < this.windowMs);

    return recentAttempts.length >= this.maxAttempts;
  }

  /**
   * Get attempt count for user
   */
  getAttemptCount(userId: string): number {
    const userAttempts = this.attempts.get(userId) || [];
    const now = Date.now();
    return userAttempts.filter((time) => now - time < this.windowMs).length;
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [userId, attempts] of this.attempts.entries()) {
      const recentAttempts = attempts.filter((time) => now - time < this.windowMs);

      if (recentAttempts.length === 0) {
        this.attempts.delete(userId);
      } else {
        this.attempts.set(userId, recentAttempts);
      }
    }
  }
}

// Global rate limiter instance
export const injectionRateLimiter = new InjectionRateLimiter();
