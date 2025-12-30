import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DataLineageService } from '../services/data-lineage';
import { 
  IngestionRecord, 
  TransformationRecord, 
  UsageRecord,
  LineageNodeType 
} from '../types/data-lineage';
import { ValidationError } from '../types/validation';

/**
 * Data Lineage API Handlers
 * 
 * Implements endpoints for data lineage tracking:
 * - POST /audit/lineage - Record data lineage (ingestion, transformation, or usage)
 * - GET /audit/lineage/{nodeId} - Get lineage node by ID
 * - GET /audit/lineage/{nodeId}/forward - Get forward lineage
 * - GET /audit/lineage/{nodeId}/backward - Get backward lineage
 * 
 * Requirements: 4.1, 4.5
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

interface ErrorResponseBody {
  error: string;
  code: string;
  details?: ValidationError[];
}

function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  details?: ValidationError[]
): APIGatewayProxyResult {
  const body: ErrorResponseBody = { error: message, code };
  if (details) body.details = details;
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

function getTenantId(event: APIGatewayProxyEvent): string | null {
  return event.headers['X-Tenant-Id'] || event.headers['x-tenant-id'] || null;
}

function parseBody<T>(event: APIGatewayProxyEvent): T | null {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}


type LineageRecordType = 'INGESTION' | 'TRANSFORMATION' | 'USAGE';

interface LineageRequestBody {
  recordType: LineageRecordType;
  dataType: string;
  // Ingestion fields
  sourceId?: string;
  sourceName?: string;
  // Transformation fields
  transformationType?: string;
  transformationParams?: Record<string, unknown>;
  parentNodeIds?: string[];
  // Usage fields
  decisionId?: string;
  decisionType?: string;
  // Common fields
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}

/**
 * POST /audit/lineage
 * Record data lineage (ingestion, transformation, or usage)
 * 
 * Requirements: 4.1
 */
export async function recordLineage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const body = parseBody<LineageRequestBody>(event);
    if (!body) {
      return errorResponse(400, 'Invalid request body', 'INVALID_BODY');
    }

    const validationErrors: ValidationError[] = [];

    // Validate common required fields
    if (!body.recordType) {
      validationErrors.push({ field: 'recordType', code: 'REQUIRED', message: 'recordType is required' });
    } else if (!['INGESTION', 'TRANSFORMATION', 'USAGE'].includes(body.recordType)) {
      validationErrors.push({ 
        field: 'recordType', 
        code: 'INVALID', 
        message: 'recordType must be INGESTION, TRANSFORMATION, or USAGE' 
      });
    }

    if (!body.dataType) {
      validationErrors.push({ field: 'dataType', code: 'REQUIRED', message: 'dataType is required' });
    }

    // Validate type-specific fields
    if (body.recordType === 'INGESTION') {
      if (!body.sourceId) {
        validationErrors.push({ field: 'sourceId', code: 'REQUIRED', message: 'sourceId is required for INGESTION' });
      }
      if (!body.sourceName) {
        validationErrors.push({ field: 'sourceName', code: 'REQUIRED', message: 'sourceName is required for INGESTION' });
      }
    }

    if (body.recordType === 'TRANSFORMATION') {
      if (!body.transformationType) {
        validationErrors.push({ field: 'transformationType', code: 'REQUIRED', message: 'transformationType is required for TRANSFORMATION' });
      }
      if (!body.parentNodeIds || !Array.isArray(body.parentNodeIds) || body.parentNodeIds.length === 0) {
        validationErrors.push({ field: 'parentNodeIds', code: 'REQUIRED', message: 'parentNodeIds is required for TRANSFORMATION' });
      }
    }

    if (body.recordType === 'USAGE') {
      if (!body.decisionId) {
        validationErrors.push({ field: 'decisionId', code: 'REQUIRED', message: 'decisionId is required for USAGE' });
      }
      if (!body.decisionType) {
        validationErrors.push({ field: 'decisionType', code: 'REQUIRED', message: 'decisionType is required for USAGE' });
      }
      if (!body.parentNodeIds || !Array.isArray(body.parentNodeIds) || body.parentNodeIds.length === 0) {
        validationErrors.push({ field: 'parentNodeIds', code: 'REQUIRED', message: 'parentNodeIds is required for USAGE' });
      }
    }

    if (validationErrors.length > 0) {
      return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', validationErrors);
    }

    let node;

    switch (body.recordType) {
      case 'INGESTION': {
        const input: IngestionRecord = {
          tenantId,
          dataType: body.dataType,
          sourceId: body.sourceId!,
          sourceName: body.sourceName!,
          qualityScore: body.qualityScore,
          metadata: body.metadata
        };
        node = await DataLineageService.recordIngestion(input);
        break;
      }
      case 'TRANSFORMATION': {
        const input: TransformationRecord = {
          tenantId,
          dataType: body.dataType,
          transformationType: body.transformationType!,
          transformationParams: body.transformationParams || {},
          parentNodeIds: body.parentNodeIds!,
          qualityScore: body.qualityScore,
          metadata: body.metadata
        };
        node = await DataLineageService.recordTransformation(input);
        break;
      }
      case 'USAGE': {
        const input: UsageRecord = {
          tenantId,
          dataType: body.dataType,
          parentNodeIds: body.parentNodeIds!,
          decisionId: body.decisionId!,
          decisionType: body.decisionType!,
          metadata: body.metadata
        };
        node = await DataLineageService.recordUsage(input);
        break;
      }
    }

    return successResponse(node, 201);
  } catch (error) {
    console.error('Error recording lineage:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/lineage/{nodeId}
 * Get lineage node by ID
 */
export async function getLineageNode(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const nodeId = event.pathParameters?.nodeId;
    if (!nodeId) {
      return errorResponse(400, 'Missing node ID', 'MISSING_PARAMETER');
    }

    const node = await DataLineageService.getNode(tenantId, nodeId);

    if (!node) {
      return errorResponse(404, 'Lineage node not found', 'NOT_FOUND');
    }

    return successResponse(node);
  } catch (error) {
    console.error('Error getting lineage node:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/lineage/{nodeId}/forward
 * Get forward lineage (what used this data)
 * 
 * Requirements: 4.5
 */
export async function getForwardLineage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const nodeId = event.pathParameters?.nodeId;
    if (!nodeId) {
      return errorResponse(400, 'Missing node ID', 'MISSING_PARAMETER');
    }

    // First check if the node exists
    const node = await DataLineageService.getNode(tenantId, nodeId);
    if (!node) {
      return errorResponse(404, 'Lineage node not found', 'NOT_FOUND');
    }

    const forwardNodes = await DataLineageService.getForwardLineage(tenantId, nodeId);

    return successResponse({
      nodeId,
      direction: 'forward',
      nodes: forwardNodes,
      count: forwardNodes.length
    });
  } catch (error) {
    console.error('Error getting forward lineage:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * GET /audit/lineage/{nodeId}/backward
 * Get backward lineage (where did this data come from)
 * 
 * Requirements: 4.5
 */
export async function getBackwardLineage(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = getTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'Missing tenant ID', 'UNAUTHORIZED');
    }

    const nodeId = event.pathParameters?.nodeId;
    if (!nodeId) {
      return errorResponse(400, 'Missing node ID', 'MISSING_PARAMETER');
    }

    // First check if the node exists
    const node = await DataLineageService.getNode(tenantId, nodeId);
    if (!node) {
      return errorResponse(404, 'Lineage node not found', 'NOT_FOUND');
    }

    const backwardNodes = await DataLineageService.getBackwardLineage(tenantId, nodeId);

    return successResponse({
      nodeId,
      direction: 'backward',
      nodes: backwardNodes,
      count: backwardNodes.length
    });
  } catch (error) {
    console.error('Error getting backward lineage:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

/**
 * Main handler that routes requests based on HTTP method and path
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const path = event.path;
  const method = event.httpMethod;

  // POST /audit/lineage
  if (method === 'POST' && path === '/audit/lineage') {
    return recordLineage(event);
  }

  // GET /audit/lineage/{nodeId}/forward
  if (method === 'GET' && path.match(/^\/audit\/lineage\/[^/]+\/forward$/)) {
    return getForwardLineage(event);
  }

  // GET /audit/lineage/{nodeId}/backward
  if (method === 'GET' && path.match(/^\/audit\/lineage\/[^/]+\/backward$/)) {
    return getBackwardLineage(event);
  }

  // GET /audit/lineage/{nodeId}
  if (method === 'GET' && path.match(/^\/audit\/lineage\/[^/]+$/)) {
    return getLineageNode(event);
  }

  return errorResponse(404, 'Route not found', 'NOT_FOUND');
}
