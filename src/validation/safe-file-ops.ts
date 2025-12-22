/**
 * Safe File Operations with Validation
 *
 * Provides file I/O operations with automatic JSON schema validation
 * and path traversal protection.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { safeParseAndValidate, sanitizeFilename, validatePathWithinDirectory } from './schemas';

/**
 * Options for safe file operations
 */
export interface SafeFileOptions {
  /**
   * Base directory for path traversal validation
   */
  baseDir: string;

  /**
   * Whether to create directory if it doesn't exist
   */
  createDir?: boolean;

  /**
   * File encoding (default: utf-8)
   */
  encoding?: BufferEncoding;
}

/**
 * Read and validate JSON file
 *
 * @param filePath - Path to JSON file
 * @param schema - Zod schema for validation
 * @param options - Safe file options
 * @returns Validated data
 * @throws Error if file doesn't exist, path traversal detected, or validation fails
 */
export function readJSONFile<T>(
  filePath: string,
  schema: z.ZodSchema<T>,
  options: SafeFileOptions
): T {
  const { baseDir, encoding = 'utf-8' } = options;

  // Validate path is within allowed directory
  if (!validatePathWithinDirectory(filePath, baseDir)) {
    throw new Error(`Path traversal detected: ${filePath} is outside ${baseDir}`);
  }

  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    const content = fs.readFileSync(filePath, encoding);

    // Parse and validate
    const result = safeParseAndValidate(content, schema);

    if (!result.success) {
      logger.error('JSON validation failed', {
        filePath,
        error: result.error,
      });
      throw new Error(`Validation failed for ${filePath}: ${result.error}`);
    }

    logger.debug('Successfully read and validated file', {
      filePath,
      size: content.length,
    });

    return result.data;
  } catch (error: any) {
    logger.error('Failed to read JSON file', {
      filePath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Write and validate JSON file
 *
 * @param filePath - Path to write JSON file
 * @param data - Data to write
 * @param schema - Zod schema for validation
 * @param options - Safe file options
 * @throws Error if path traversal detected or validation fails
 */
export function writeJSONFile<T>(
  filePath: string,
  data: T,
  schema: z.ZodSchema<T>,
  options: SafeFileOptions
): void {
  const { baseDir, createDir = true, encoding = 'utf-8' } = options;

  // Validate path is within allowed directory
  if (!validatePathWithinDirectory(filePath, baseDir)) {
    throw new Error(`Path traversal detected: ${filePath} is outside ${baseDir}`);
  }

  try {
    // Validate data before writing
    const validated = schema.parse(data);

    // Create directory if needed
    const dir = path.dirname(filePath);
    if (createDir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    const jsonString = JSON.stringify(validated, null, 2);
    fs.writeFileSync(filePath, jsonString, encoding);

    logger.debug('Successfully wrote and validated file', {
      filePath,
      size: jsonString.length,
    });
  } catch (error: any) {
    logger.error('Failed to write JSON file', {
      filePath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * List files in directory with validation
 *
 * @param dirPath - Directory path
 * @param baseDir - Base directory for path validation
 * @returns Array of file names
 */
export function listFiles(dirPath: string, baseDir: string): string[] {
  // Validate path is within allowed directory
  if (!validatePathWithinDirectory(dirPath, baseDir)) {
    throw new Error(`Path traversal detected: ${dirPath} is outside ${baseDir}`);
  }

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  try {
    const files = fs.readdirSync(dirPath);
    return files.filter((file) => {
      const fullPath = path.join(dirPath, file);
      return fs.statSync(fullPath).isFile();
    });
  } catch (error: any) {
    logger.error('Failed to list files', {
      dirPath,
      error: error.message,
    });
    return [];
  }
}

/**
 * Delete file with path validation
 *
 * @param filePath - File to delete
 * @param baseDir - Base directory for path validation
 */
export function deleteFile(filePath: string, baseDir: string): void {
  // Validate path is within allowed directory
  if (!validatePathWithinDirectory(filePath, baseDir)) {
    throw new Error(`Path traversal detected: ${filePath} is outside ${baseDir}`);
  }

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      logger.debug('Successfully deleted file', { filePath });
    } catch (error: any) {
      logger.error('Failed to delete file', {
        filePath,
        error: error.message,
      });
      throw error;
    }
  }
}

/**
 * Build safe file path with sanitization
 *
 * @param baseDir - Base directory
 * @param id - File ID (will be sanitized)
 * @param extension - File extension (default: .json)
 * @returns Safe file path
 */
export function buildSafeFilePath(
  baseDir: string,
  id: string,
  extension: string = '.json'
): string {
  const safeId = sanitizeFilename(id);
  const filePath = path.join(baseDir, `${safeId}${extension}`);

  // Double-check path is safe
  if (!validatePathWithinDirectory(filePath, baseDir)) {
    throw new Error(`Generated unsafe path: ${filePath}`);
  }

  return filePath;
}

/**
 * Read multiple JSON files with validation
 *
 * @param dirPath - Directory containing JSON files
 * @param schema - Zod schema for validation
 * @param options - Safe file options
 * @returns Array of validated data
 */
export function readAllJSONFiles<T>(
  dirPath: string,
  schema: z.ZodSchema<T>,
  options: SafeFileOptions
): T[] {
  const files = listFiles(dirPath, options.baseDir);
  const results: T[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(dirPath, file);

    try {
      const data = readJSONFile(filePath, schema, options);
      results.push(data);
    } catch (error: any) {
      logger.warn('Skipping invalid file', {
        filePath,
        error: error.message,
      });
      // Continue processing other files
    }
  }

  return results;
}

/**
 * Safe file operation error types
 */
export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
