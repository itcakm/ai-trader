import { Strategy, StrategyState, ParameterValue } from '../types';

/**
 * JSON representation of a Strategy for persistence
 */
export interface SerializedStrategy {
  strategyId: string;
  tenantId: string;
  name: string;
  templateId: string;
  templateVersion: number;
  parameters: string; // JSON-encoded Record<string, ParameterValue>
  currentVersion: number;
  state: StrategyState;
  createdAt: string;
  updatedAt: string;
}

/**
 * Serializes a Strategy object to JSON format for DynamoDB storage
 * 
 * @param strategy - The Strategy object to serialize
 * @returns SerializedStrategy with parameters encoded as JSON string
 */
export function serializeStrategy(strategy: Strategy): SerializedStrategy {
  return {
    strategyId: strategy.strategyId,
    tenantId: strategy.tenantId,
    name: strategy.name,
    templateId: strategy.templateId,
    templateVersion: strategy.templateVersion,
    parameters: JSON.stringify(strategy.parameters),
    currentVersion: strategy.currentVersion,
    state: strategy.state,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt
  };
}

/**
 * Deserializes a JSON object from DynamoDB back to a Strategy object
 * 
 * @param data - The serialized strategy data from DynamoDB
 * @returns Strategy object with parameters decoded from JSON
 * @throws Error if the data is invalid or cannot be deserialized
 */
export function deserializeStrategy(data: SerializedStrategy): Strategy {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid strategy data: expected an object');
  }

  // Validate required fields
  const requiredFields = [
    'strategyId', 'tenantId', 'name', 'templateId', 
    'templateVersion', 'parameters', 'currentVersion', 
    'state', 'createdAt', 'updatedAt'
  ];
  
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Invalid strategy data: missing required field '${field}'`);
    }
  }

  // Parse parameters from JSON string
  let parameters: Record<string, ParameterValue>;
  try {
    parameters = typeof data.parameters === 'string' 
      ? JSON.parse(data.parameters)
      : data.parameters;
  } catch (e) {
    throw new Error('Invalid strategy data: parameters is not valid JSON');
  }

  // Validate state is a valid StrategyState
  const validStates: StrategyState[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED', 'ERROR'];
  if (!validStates.includes(data.state)) {
    throw new Error(`Invalid strategy data: invalid state '${data.state}'`);
  }

  return {
    strategyId: data.strategyId,
    tenantId: data.tenantId,
    name: data.name,
    templateId: data.templateId,
    templateVersion: data.templateVersion,
    parameters,
    currentVersion: data.currentVersion,
    state: data.state,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

/**
 * Checks if two Strategy objects are equivalent
 * Used for testing round-trip serialization
 * 
 * @param a - First strategy
 * @param b - Second strategy
 * @returns true if strategies are equivalent
 */
export function strategiesAreEqual(a: Strategy, b: Strategy): boolean {
  return (
    a.strategyId === b.strategyId &&
    a.tenantId === b.tenantId &&
    a.name === b.name &&
    a.templateId === b.templateId &&
    a.templateVersion === b.templateVersion &&
    a.currentVersion === b.currentVersion &&
    a.state === b.state &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    parametersAreEqual(a.parameters, b.parameters)
  );
}

/**
 * Checks if two parameter records are equivalent
 */
function parametersAreEqual(
  a: Record<string, ParameterValue>,
  b: Record<string, ParameterValue>
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) {
    return false;
  }
  
  return keysA.every(key => a[key] === b[key]);
}
