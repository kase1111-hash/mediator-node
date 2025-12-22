/**
 * Input Length Validation
 *
 * Provides comprehensive input length limits to prevent DoS attacks
 * and resource exhaustion from oversized payloads.
 */

import { logger } from '../utils/logger';

/**
 * Input length limits (in bytes/characters)
 */
export const INPUT_LIMITS = {
  // Text content limits
  PROSE_MAX: 10000, // Intent prose
  DESIRE_MAX: 1000, // Single desire/constraint
  DESIRES_ARRAY_MAX: 100, // Number of desires
  CONSTRAINTS_ARRAY_MAX: 100, // Number of constraints

  // ID and identifier limits
  ID_MAX: 256,
  HASH_MAX: 256,
  AUTHOR_MAX: 256,
  MEDIATOR_ID_MAX: 256,

  // Settlement and reasoning
  REASONING_TRACE_MAX: 20000,
  SETTLEMENT_TERMS_MAX: 5000,
  TIMELINE_MAX: 500,

  // Dispute and evidence
  DISPUTE_DESCRIPTION_MAX: 10000,
  EVIDENCE_CONTENT_MAX: 100000,
  RESOLUTION_MAX: 10000,
  CHALLENGE_REASON_MAX: 5000,

  // Metadata and signatures
  METADATA_JSON_MAX: 10000,
  SIGNATURE_MAX: 1024,
  NONCE_MAX: 256,

  // Array limits (number of items)
  EVIDENCE_ITEMS_MAX: 100,
  SIGNALS_ARRAY_MAX: 10000,

  // JSON payload limits
  REQUEST_BODY_MAX: 1024 * 1024, // 1 MB total request size
  WEBSOCKET_MESSAGE_MAX: 100 * 1024, // 100 KB WebSocket messages
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  field?: string;
}

/**
 * Validate string length
 *
 * @param value - String to validate
 * @param fieldName - Field name for error messages
 * @param maxLength - Maximum allowed length
 * @param minLength - Minimum allowed length (default: 0)
 * @returns Validation result
 */
export function validateStringLength(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
  minLength: number = 0
): ValidationResult {
  if (value === undefined) {
    return { valid: true };
  }

  if (typeof value !== 'string') {
    return {
      valid: false,
      error: `${fieldName} must be a string`,
      field: fieldName,
    };
  }

  if (value.length < minLength) {
    return {
      valid: false,
      error: `${fieldName} must be at least ${minLength} characters`,
      field: fieldName,
    };
  }

  if (value.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters (got ${value.length})`,
      field: fieldName,
    };
  }

  return { valid: true };
}

/**
 * Validate array length
 *
 * @param array - Array to validate
 * @param fieldName - Field name for error messages
 * @param maxLength - Maximum allowed length
 * @param minLength - Minimum allowed length (default: 0)
 * @returns Validation result
 */
export function validateArrayLength(
  array: any[] | undefined,
  fieldName: string,
  maxLength: number,
  minLength: number = 0
): ValidationResult {
  if (array === undefined) {
    return { valid: true };
  }

  if (!Array.isArray(array)) {
    return {
      valid: false,
      error: `${fieldName} must be an array`,
      field: fieldName,
    };
  }

  if (array.length < minLength) {
    return {
      valid: false,
      error: `${fieldName} must contain at least ${minLength} items`,
      field: fieldName,
    };
  }

  if (array.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} items (got ${array.length})`,
      field: fieldName,
    };
  }

  return { valid: true };
}

/**
 * Validate intent input lengths
 *
 * @param intent - Intent object to validate
 * @returns Validation result
 */
export function validateIntentLimits(intent: {
  prose?: string;
  desires?: string[];
  constraints?: string[];
  author?: string;
  hash?: string;
  nonce?: string;
  signature?: string;
  [key: string]: any;
}): ValidationResult {
  // Validate prose
  let result = validateStringLength(
    intent.prose,
    'prose',
    INPUT_LIMITS.PROSE_MAX,
    1
  );
  if (!result.valid) return result;

  // Validate author
  result = validateStringLength(
    intent.author,
    'author',
    INPUT_LIMITS.AUTHOR_MAX,
    1
  );
  if (!result.valid) return result;

  // Validate hash
  result = validateStringLength(intent.hash, 'hash', INPUT_LIMITS.HASH_MAX);
  if (!result.valid) return result;

  // Validate nonce
  result = validateStringLength(intent.nonce, 'nonce', INPUT_LIMITS.NONCE_MAX);
  if (!result.valid) return result;

  // Validate signature
  result = validateStringLength(
    intent.signature,
    'signature',
    INPUT_LIMITS.SIGNATURE_MAX
  );
  if (!result.valid) return result;

  // Validate desires array
  result = validateArrayLength(
    intent.desires,
    'desires',
    INPUT_LIMITS.DESIRES_ARRAY_MAX
  );
  if (!result.valid) return result;

  // Validate individual desires
  if (intent.desires && Array.isArray(intent.desires)) {
    for (let i = 0; i < intent.desires.length; i++) {
      result = validateStringLength(
        intent.desires[i],
        `desires[${i}]`,
        INPUT_LIMITS.DESIRE_MAX
      );
      if (!result.valid) return result;
    }
  }

  // Validate constraints array
  result = validateArrayLength(
    intent.constraints,
    'constraints',
    INPUT_LIMITS.CONSTRAINTS_ARRAY_MAX
  );
  if (!result.valid) return result;

  // Validate individual constraints
  if (intent.constraints && Array.isArray(intent.constraints)) {
    for (let i = 0; i < intent.constraints.length; i++) {
      result = validateStringLength(
        intent.constraints[i],
        `constraints[${i}]`,
        INPUT_LIMITS.DESIRE_MAX
      );
      if (!result.valid) return result;
    }
  }

  return { valid: true };
}

/**
 * Validate settlement input lengths
 *
 * @param settlement - Settlement object to validate
 * @returns Validation result
 */
export function validateSettlementLimits(settlement: {
  reasoningTrace?: string;
  mediatorId?: string;
  [key: string]: any;
}): ValidationResult {
  // Validate reasoning trace
  let result = validateStringLength(
    settlement.reasoningTrace,
    'reasoningTrace',
    INPUT_LIMITS.REASONING_TRACE_MAX
  );
  if (!result.valid) return result;

  // Validate mediator ID
  result = validateStringLength(
    settlement.mediatorId,
    'mediatorId',
    INPUT_LIMITS.MEDIATOR_ID_MAX
  );
  if (!result.valid) return result;

  return { valid: true };
}

/**
 * Validate dispute input lengths
 *
 * @param dispute - Dispute object to validate
 * @returns Validation result
 */
export function validateDisputeLimits(dispute: {
  description?: string;
  evidence?: any[];
  resolution?: string;
  [key: string]: any;
}): ValidationResult {
  // Validate description
  let result = validateStringLength(
    dispute.description,
    'description',
    INPUT_LIMITS.DISPUTE_DESCRIPTION_MAX,
    1
  );
  if (!result.valid) return result;

  // Validate evidence array
  result = validateArrayLength(
    dispute.evidence,
    'evidence',
    INPUT_LIMITS.EVIDENCE_ITEMS_MAX
  );
  if (!result.valid) return result;

  // Validate resolution
  result = validateStringLength(
    dispute.resolution,
    'resolution',
    INPUT_LIMITS.RESOLUTION_MAX
  );
  if (!result.valid) return result;

  return { valid: true };
}

/**
 * Log validation failure
 *
 * @param result - Validation result
 * @param context - Additional context for logging
 */
export function logValidationFailure(
  result: ValidationResult,
  context: { userId?: string; endpoint?: string; field?: string } = {}
): void {
  if (!result.valid) {
    logger.warn('Input validation failed', {
      error: result.error,
      field: result.field || context.field,
      endpoint: context.endpoint,
      userId: context.userId,
    });
  }
}
