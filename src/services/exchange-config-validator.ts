/**
 * Exchange Configuration Validator
 *
 * Validates exchange configuration inputs for registration and updates.
 * Ensures all required fields are present and credentials format is correct
 * based on the authentication method.
 *
 * Requirements: 1.2, 1.5
 */

import {
  ExchangeId,
  ExchangeMode,
  AuthMethod,
  ExchangeConfigInput,
  EncryptedCredentials,
  ExchangeFeatures,
  ExchangeRateLimits,
} from '../types/exchange';
import { OrderType, TimeInForce } from '../types/exchange-order';

/**
 * Validation error with details about what failed
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Valid exchange IDs
 */
const VALID_EXCHANGE_IDS: ExchangeId[] = [
  'BINANCE',
  'COINBASE',
  'KRAKEN',
  'OKX',
  'BSDEX',
  'BISON',
  'FINOA',
  'BYBIT',
];

/**
 * Valid exchange modes
 */
const VALID_MODES: ExchangeMode[] = ['PRODUCTION', 'SANDBOX'];

/**
 * Valid authentication methods
 */
const VALID_AUTH_METHODS: AuthMethod[] = ['API_KEY', 'HMAC', 'OAUTH', 'FIX_CREDENTIALS'];

/**
 * Valid order types
 */
const VALID_ORDER_TYPES: OrderType[] = [
  'MARKET',
  'LIMIT',
  'STOP_LIMIT',
  'STOP_MARKET',
  'TRAILING_STOP',
];

/**
 * Valid time-in-force options
 */
const VALID_TIME_IN_FORCE: TimeInForce[] = ['GTC', 'IOC', 'FOK', 'GTD'];

/**
 * Validates an exchange configuration input
 */
export function validateExchangeConfig(config: ExchangeConfigInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate exchangeId
  if (!config.exchangeId) {
    errors.push({
      field: 'exchangeId',
      message: 'Exchange ID is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!VALID_EXCHANGE_IDS.includes(config.exchangeId)) {
    errors.push({
      field: 'exchangeId',
      message: `Invalid exchange ID. Must be one of: ${VALID_EXCHANGE_IDS.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Validate name
  if (!config.name || config.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Name is required and cannot be empty',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.name.length > 100) {
    errors.push({
      field: 'name',
      message: 'Name must be 100 characters or less',
      code: 'INVALID_LENGTH',
    });
  }

  // Validate mode
  if (!config.mode) {
    errors.push({
      field: 'mode',
      message: 'Mode is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!VALID_MODES.includes(config.mode)) {
    errors.push({
      field: 'mode',
      message: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Validate restEndpoint
  if (!config.restEndpoint) {
    errors.push({
      field: 'restEndpoint',
      message: 'REST endpoint is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!isValidUrl(config.restEndpoint)) {
    errors.push({
      field: 'restEndpoint',
      message: 'REST endpoint must be a valid HTTPS URL',
      code: 'INVALID_FORMAT',
    });
  }

  // Validate optional wsEndpoint
  if (config.wsEndpoint && !isValidWsUrl(config.wsEndpoint)) {
    errors.push({
      field: 'wsEndpoint',
      message: 'WebSocket endpoint must be a valid WSS URL',
      code: 'INVALID_FORMAT',
    });
  }

  // Validate optional fixEndpoint
  if (config.fixEndpoint && !isValidFixEndpoint(config.fixEndpoint)) {
    errors.push({
      field: 'fixEndpoint',
      message: 'FIX endpoint must be in format host:port',
      code: 'INVALID_FORMAT',
    });
  }

  // Validate authMethod
  if (!config.authMethod) {
    errors.push({
      field: 'authMethod',
      message: 'Authentication method is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (!VALID_AUTH_METHODS.includes(config.authMethod)) {
    errors.push({
      field: 'authMethod',
      message: `Invalid auth method. Must be one of: ${VALID_AUTH_METHODS.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Validate credentials
  if (!config.credentials) {
    errors.push({
      field: 'credentials',
      message: 'Credentials are required',
      code: 'REQUIRED_FIELD',
    });
  } else {
    const credentialErrors = validateCredentials(config.credentials, config.authMethod);
    errors.push(...credentialErrors);
  }

  // Validate supportedFeatures
  if (!config.supportedFeatures) {
    errors.push({
      field: 'supportedFeatures',
      message: 'Supported features are required',
      code: 'REQUIRED_FIELD',
    });
  } else {
    const featureErrors = validateFeatures(config.supportedFeatures);
    errors.push(...featureErrors);
  }

  // Validate rateLimits
  if (!config.rateLimits) {
    errors.push({
      field: 'rateLimits',
      message: 'Rate limits are required',
      code: 'REQUIRED_FIELD',
    });
  } else {
    const rateLimitErrors = validateRateLimits(config.rateLimits);
    errors.push(...rateLimitErrors);
  }

  // Validate optional priority
  if (config.priority !== undefined && (config.priority < 0 || !Number.isInteger(config.priority))) {
    errors.push({
      field: 'priority',
      message: 'Priority must be a non-negative integer',
      code: 'INVALID_VALUE',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


/**
 * Validates credentials based on authentication method
 */
export function validateCredentials(
  credentials: EncryptedCredentials,
  authMethod?: AuthMethod
): ValidationError[] {
  const errors: ValidationError[] = [];

  // API key is always required
  if (!credentials.apiKey || credentials.apiKey.trim().length === 0) {
    errors.push({
      field: 'credentials.apiKey',
      message: 'API key is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (credentials.apiKey.length < 8) {
    errors.push({
      field: 'credentials.apiKey',
      message: 'API key must be at least 8 characters',
      code: 'INVALID_LENGTH',
    });
  }

  // API secret is always required
  if (!credentials.apiSecret || credentials.apiSecret.trim().length === 0) {
    errors.push({
      field: 'credentials.apiSecret',
      message: 'API secret is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (credentials.apiSecret.length < 8) {
    errors.push({
      field: 'credentials.apiSecret',
      message: 'API secret must be at least 8 characters',
      code: 'INVALID_LENGTH',
    });
  }

  // Validate auth method specific requirements
  if (authMethod === 'FIX_CREDENTIALS') {
    if (!credentials.fixSenderCompId || credentials.fixSenderCompId.trim().length === 0) {
      errors.push({
        field: 'credentials.fixSenderCompId',
        message: 'FIX Sender Comp ID is required for FIX authentication',
        code: 'REQUIRED_FIELD',
      });
    }
    if (!credentials.fixTargetCompId || credentials.fixTargetCompId.trim().length === 0) {
      errors.push({
        field: 'credentials.fixTargetCompId',
        message: 'FIX Target Comp ID is required for FIX authentication',
        code: 'REQUIRED_FIELD',
      });
    }
  }

  // Passphrase validation (required for some exchanges like Coinbase)
  // Note: This is optional in the interface, so we don't require it by default
  // Specific exchange adapters can enforce this requirement

  return errors;
}

/**
 * Validates exchange features configuration
 */
export function validateFeatures(features: ExchangeFeatures): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate supportedOrderTypes
  if (!features.supportedOrderTypes || !Array.isArray(features.supportedOrderTypes)) {
    errors.push({
      field: 'supportedFeatures.supportedOrderTypes',
      message: 'Supported order types must be an array',
      code: 'INVALID_TYPE',
    });
  } else if (features.supportedOrderTypes.length === 0) {
    errors.push({
      field: 'supportedFeatures.supportedOrderTypes',
      message: 'At least one order type must be supported',
      code: 'REQUIRED_FIELD',
    });
  } else {
    for (const orderType of features.supportedOrderTypes) {
      if (!VALID_ORDER_TYPES.includes(orderType)) {
        errors.push({
          field: 'supportedFeatures.supportedOrderTypes',
          message: `Invalid order type: ${orderType}. Must be one of: ${VALID_ORDER_TYPES.join(', ')}`,
          code: 'INVALID_VALUE',
        });
      }
    }
  }

  // Validate supportedAssets
  if (!features.supportedAssets || !Array.isArray(features.supportedAssets)) {
    errors.push({
      field: 'supportedFeatures.supportedAssets',
      message: 'Supported assets must be an array',
      code: 'INVALID_TYPE',
    });
  } else if (features.supportedAssets.length === 0) {
    errors.push({
      field: 'supportedFeatures.supportedAssets',
      message: 'At least one asset must be supported',
      code: 'REQUIRED_FIELD',
    });
  }

  // Validate supportedTimeInForce
  if (!features.supportedTimeInForce || !Array.isArray(features.supportedTimeInForce)) {
    errors.push({
      field: 'supportedFeatures.supportedTimeInForce',
      message: 'Supported time-in-force options must be an array',
      code: 'INVALID_TYPE',
    });
  } else if (features.supportedTimeInForce.length === 0) {
    errors.push({
      field: 'supportedFeatures.supportedTimeInForce',
      message: 'At least one time-in-force option must be supported',
      code: 'REQUIRED_FIELD',
    });
  } else {
    for (const tif of features.supportedTimeInForce) {
      if (!VALID_TIME_IN_FORCE.includes(tif)) {
        errors.push({
          field: 'supportedFeatures.supportedTimeInForce',
          message: `Invalid time-in-force: ${tif}. Must be one of: ${VALID_TIME_IN_FORCE.join(', ')}`,
          code: 'INVALID_VALUE',
        });
      }
    }
  }

  // Validate numeric fields
  if (typeof features.maxOrderSize !== 'number' || features.maxOrderSize <= 0) {
    errors.push({
      field: 'supportedFeatures.maxOrderSize',
      message: 'Max order size must be a positive number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof features.minOrderSize !== 'number' || features.minOrderSize <= 0) {
    errors.push({
      field: 'supportedFeatures.minOrderSize',
      message: 'Min order size must be a positive number',
      code: 'INVALID_VALUE',
    });
  }

  if (
    typeof features.maxOrderSize === 'number' &&
    typeof features.minOrderSize === 'number' &&
    features.minOrderSize > features.maxOrderSize
  ) {
    errors.push({
      field: 'supportedFeatures.minOrderSize',
      message: 'Min order size cannot be greater than max order size',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof features.tickSize !== 'number' || features.tickSize <= 0) {
    errors.push({
      field: 'supportedFeatures.tickSize',
      message: 'Tick size must be a positive number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof features.lotSize !== 'number' || features.lotSize <= 0) {
    errors.push({
      field: 'supportedFeatures.lotSize',
      message: 'Lot size must be a positive number',
      code: 'INVALID_VALUE',
    });
  }

  // Validate boolean fields
  if (typeof features.supportsOrderModification !== 'boolean') {
    errors.push({
      field: 'supportedFeatures.supportsOrderModification',
      message: 'supportsOrderModification must be a boolean',
      code: 'INVALID_TYPE',
    });
  }

  if (typeof features.supportsWebSocket !== 'boolean') {
    errors.push({
      field: 'supportedFeatures.supportsWebSocket',
      message: 'supportsWebSocket must be a boolean',
      code: 'INVALID_TYPE',
    });
  }

  if (typeof features.supportsFIX !== 'boolean') {
    errors.push({
      field: 'supportedFeatures.supportsFIX',
      message: 'supportsFIX must be a boolean',
      code: 'INVALID_TYPE',
    });
  }

  return errors;
}


/**
 * Validates rate limit configuration
 */
export function validateRateLimits(rateLimits: ExchangeRateLimits): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof rateLimits.ordersPerSecond !== 'number' || rateLimits.ordersPerSecond < 0) {
    errors.push({
      field: 'rateLimits.ordersPerSecond',
      message: 'Orders per second must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof rateLimits.ordersPerMinute !== 'number' || rateLimits.ordersPerMinute < 0) {
    errors.push({
      field: 'rateLimits.ordersPerMinute',
      message: 'Orders per minute must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof rateLimits.queriesPerSecond !== 'number' || rateLimits.queriesPerSecond < 0) {
    errors.push({
      field: 'rateLimits.queriesPerSecond',
      message: 'Queries per second must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof rateLimits.queriesPerMinute !== 'number' || rateLimits.queriesPerMinute < 0) {
    errors.push({
      field: 'rateLimits.queriesPerMinute',
      message: 'Queries per minute must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  if (typeof rateLimits.wsMessagesPerSecond !== 'number' || rateLimits.wsMessagesPerSecond < 0) {
    errors.push({
      field: 'rateLimits.wsMessagesPerSecond',
      message: 'WebSocket messages per second must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  // Optional weightPerMinute
  if (
    rateLimits.weightPerMinute !== undefined &&
    (typeof rateLimits.weightPerMinute !== 'number' || rateLimits.weightPerMinute < 0)
  ) {
    errors.push({
      field: 'rateLimits.weightPerMinute',
      message: 'Weight per minute must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }

  // Validate consistency: per-second limits should not exceed per-minute limits / 60
  if (
    typeof rateLimits.ordersPerSecond === 'number' &&
    typeof rateLimits.ordersPerMinute === 'number' &&
    rateLimits.ordersPerSecond > 0 &&
    rateLimits.ordersPerMinute > 0 &&
    rateLimits.ordersPerSecond * 60 > rateLimits.ordersPerMinute * 2 // Allow some burst
  ) {
    errors.push({
      field: 'rateLimits.ordersPerSecond',
      message: 'Orders per second seems inconsistent with orders per minute',
      code: 'INCONSISTENT_VALUE',
    });
  }

  if (
    typeof rateLimits.queriesPerSecond === 'number' &&
    typeof rateLimits.queriesPerMinute === 'number' &&
    rateLimits.queriesPerSecond > 0 &&
    rateLimits.queriesPerMinute > 0 &&
    rateLimits.queriesPerSecond * 60 > rateLimits.queriesPerMinute * 2 // Allow some burst
  ) {
    errors.push({
      field: 'rateLimits.queriesPerSecond',
      message: 'Queries per second seems inconsistent with queries per minute',
      code: 'INCONSISTENT_VALUE',
    });
  }

  return errors;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Validates that a string is a valid HTTPS URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a valid WebSocket URL (wss://)
 */
function isValidWsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a valid FIX endpoint (host:port format)
 */
function isValidFixEndpoint(endpoint: string): boolean {
  const parts = endpoint.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [host, portStr] = parts;
  if (!host || host.trim().length === 0) {
    return false;
  }
  const port = parseInt(portStr, 10);
  return !isNaN(port) && port > 0 && port <= 65535;
}

/**
 * Creates a validation error
 */
export function createValidationError(
  field: string,
  message: string,
  code: string
): ValidationError {
  return { field, message, code };
}

/**
 * Checks if a validation result has errors
 */
export function hasErrors(result: ValidationResult): boolean {
  return !result.valid;
}

/**
 * Gets error messages as a formatted string
 */
export function formatErrors(result: ValidationResult): string {
  if (result.valid) {
    return '';
  }
  return result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
}
