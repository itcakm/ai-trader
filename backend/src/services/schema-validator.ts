/**
 * Schema Validator Service
 * Validates AI model outputs against predefined JSON schemas.
 * Requirements: 9.1, 9.2
 */

import Ajv, { ErrorObject } from 'ajv';
import {
  RegimeClassificationSchema,
  RegimeClassificationOutput
} from '../schemas/regime-classification';
import {
  ExplanationSchema,
  ExplanationOutput
} from '../schemas/explanation';
import {
  ParameterSuggestionSchema,
  ParameterSuggestionOutput
} from '../schemas/parameter-suggestion';

export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

export interface SchemaValidationResult<T = unknown> {
  valid: boolean;
  errors: SchemaValidationError[];
  rawOutput: string;
  parsedOutput?: T;
}

export class SchemaValidator {
  private ajv: Ajv;
  private validateRegime: ReturnType<Ajv['compile']>;
  private validateExplanationSchema: ReturnType<Ajv['compile']>;
  private validateParameterSuggestionSchema: ReturnType<Ajv['compile']>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.validateRegime = this.ajv.compile(RegimeClassificationSchema);
    this.validateExplanationSchema = this.ajv.compile(ExplanationSchema);
    this.validateParameterSuggestionSchema = this.ajv.compile(ParameterSuggestionSchema);
  }

  /**
   * Converts AJV errors to our SchemaValidationError format
   */
  private convertErrors(errors: ErrorObject[] | null | undefined): SchemaValidationError[] {
    if (!errors) return [];

    return errors.map((error) => ({
      path: error.instancePath || '/',
      message: error.message || 'Unknown validation error',
      keyword: error.keyword,
      params: error.params as Record<string, unknown>
    }));
  }

  /**
   * Parses raw output string to JSON
   */
  private parseOutput(rawOutput: string): { parsed: unknown; error?: string } {
    try {
      const parsed = JSON.parse(rawOutput);
      return { parsed };
    } catch (e) {
      return {
        parsed: null,
        error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validates regime classification output against schema.
   * Returns detailed error messages with field paths on failure.
   */
  validateRegimeClassification(output: unknown): SchemaValidationResult<RegimeClassificationOutput> {
    const rawOutput = typeof output === 'string' ? output : JSON.stringify(output);
    
    // Parse if string
    let parsedOutput: unknown;
    if (typeof output === 'string') {
      const parseResult = this.parseOutput(output);
      if (parseResult.error) {
        return {
          valid: false,
          errors: [{
            path: '/',
            message: parseResult.error,
            keyword: 'parse',
            params: {}
          }],
          rawOutput
        };
      }
      parsedOutput = parseResult.parsed;
    } else {
      parsedOutput = output;
    }

    const valid = this.validateRegime(parsedOutput);

    if (valid) {
      return {
        valid: true,
        errors: [],
        rawOutput,
        parsedOutput: parsedOutput as RegimeClassificationOutput
      };
    }

    return {
      valid: false,
      errors: this.convertErrors(this.validateRegime.errors),
      rawOutput
    };
  }

  /**
   * Validates explanation output against schema.
   * Returns detailed error messages with field paths on failure.
   */
  validateExplanation(output: unknown): SchemaValidationResult<ExplanationOutput> {
    const rawOutput = typeof output === 'string' ? output : JSON.stringify(output);
    
    // Parse if string
    let parsedOutput: unknown;
    if (typeof output === 'string') {
      const parseResult = this.parseOutput(output);
      if (parseResult.error) {
        return {
          valid: false,
          errors: [{
            path: '/',
            message: parseResult.error,
            keyword: 'parse',
            params: {}
          }],
          rawOutput
        };
      }
      parsedOutput = parseResult.parsed;
    } else {
      parsedOutput = output;
    }

    const valid = this.validateExplanationSchema(parsedOutput);

    if (valid) {
      return {
        valid: true,
        errors: [],
        rawOutput,
        parsedOutput: parsedOutput as ExplanationOutput
      };
    }

    return {
      valid: false,
      errors: this.convertErrors(this.validateExplanationSchema.errors),
      rawOutput
    };
  }

  /**
   * Validates parameter suggestion output against schema.
   * Returns detailed error messages with field paths on failure.
   */
  validateParameterSuggestion(output: unknown): SchemaValidationResult<ParameterSuggestionOutput> {
    const rawOutput = typeof output === 'string' ? output : JSON.stringify(output);
    
    // Parse if string
    let parsedOutput: unknown;
    if (typeof output === 'string') {
      const parseResult = this.parseOutput(output);
      if (parseResult.error) {
        return {
          valid: false,
          errors: [{
            path: '/',
            message: parseResult.error,
            keyword: 'parse',
            params: {}
          }],
          rawOutput
        };
      }
      parsedOutput = parseResult.parsed;
    } else {
      parsedOutput = output;
    }

    const valid = this.validateParameterSuggestionSchema(parsedOutput);

    if (valid) {
      return {
        valid: true,
        errors: [],
        rawOutput,
        parsedOutput: parsedOutput as ParameterSuggestionOutput
      };
    }

    return {
      valid: false,
      errors: this.convertErrors(this.validateParameterSuggestionSchema.errors),
      rawOutput
    };
  }

  /**
   * Registers a custom schema for validation.
   */
  registerSchema(type: string, schema: object): void {
    this.ajv.addSchema(schema, type);
  }
}

// Singleton instance for convenience
export const schemaValidator = new SchemaValidator();
