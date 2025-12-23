/**
 * Individual validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
