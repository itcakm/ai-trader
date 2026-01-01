import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Unit tests for Lambda handler error response formatting
 * 
 * Verifies HTTP status codes and error message structure
 * 
 * Requirements: 6.4
 */

// Mock the repositories and services to avoid DynamoDB calls
jest.mock('../repositories/template', () => ({
  TemplateRepository: {
    listTemplates: jest.fn(),
    getTemplate: jest.fn(),
    getTemplateVersion: jest.fn()
  }
}));

jest.mock('../services/strategy', () => ({
  StrategyService: {
    createStrategy: jest.fn(),
    getStrategy: jest.fn(),
    listStrategies: jest.fn(),
    updateParameters: jest.fn(),
    getVersionHistory: jest.fn(),
    getVersion: jest.fn(),
    rollbackToVersion: jest.fn()
  },
  ValidationFailedError: class ValidationFailedError extends Error {
    validationResult: { valid: boolean; errors: Array<{ field: string; code: string; message: string }> };
    constructor(message: string, validationResult: { valid: boolean; errors: Array<{ field: string; code: string; message: string }> }) {
      super(message);
      this.name = 'ValidationFailedError';
      this.validationResult = validationResult;
    }
  },
  InvalidTemplateReferenceError: class InvalidTemplateReferenceError extends Error {
    constructor(templateId: string, version?: number) {
      super(`Invalid template reference: ${templateId}`);
      this.name = 'InvalidTemplateReferenceError';
    }
  }
}));

jest.mock('../services/deployment', () => ({
  DeploymentService: {
    deploy: jest.fn(),
    getDeployment: jest.fn(),
    listDeployments: jest.fn(),
    updateState: jest.fn()
  },
  DeploymentValidationError: class DeploymentValidationError extends Error {
    validationResult: { valid: boolean; errors: Array<{ field: string; code: string; message: string }> };
    constructor(message: string, validationResult: { valid: boolean; errors: Array<{ field: string; code: string; message: string }> }) {
      super(message);
      this.name = 'DeploymentValidationError';
      this.validationResult = validationResult;
    }
  },
  InvalidTemplateReferenceError: class InvalidTemplateReferenceError extends Error {
    constructor(templateId: string) {
      super(`Invalid template reference: ${templateId}`);
      this.name = 'InvalidTemplateReferenceError';
    }
  },
  InvalidStateTransitionError: class InvalidStateTransitionError extends Error {
    constructor(currentState: string, targetState: string) {
      super(`Invalid state transition from '${currentState}' to '${targetState}'`);
      this.name = 'InvalidStateTransitionError';
    }
  },
  RiskControls: {}
}));

jest.mock('../repositories/strategy', () => ({
  StrategyRepository: {
    deleteStrategy: jest.fn()
  }
}));

jest.mock('../db/access', () => ({
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    constructor(resourceType: string, resourceId: string) {
      super(`${resourceType} not found: ${resourceId}`);
      this.name = 'ResourceNotFoundError';
    }
  }
}));

import { handler as templatesHandler } from './templates';
import { handler as strategiesHandler } from './strategies';
import { handler as versionsHandler } from './versions';
import { handler as deploymentsHandler } from './deployments';
import { TemplateRepository } from '../repositories/template';
import { StrategyService, ValidationFailedError } from '../services/strategy';
import { DeploymentService, DeploymentValidationError, InvalidStateTransitionError } from '../services/deployment';
import { ResourceNotFoundError } from '../db/access';

/**
 * Helper to create a mock API Gateway event
 */
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: { 'X-Tenant-Id': 'test-tenant-123' },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides
  };
}

describe('Lambda Handlers - Error Response Formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Response Structure (Requirement 6.4)', () => {
    it('should return error response with correct structure', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/templates/non-existent',
        pathParameters: { id: 'non-existent' }
      });

      (TemplateRepository.getTemplate as jest.Mock).mockResolvedValue(null);

      const response = await templatesHandler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(404);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
      expect(typeof body.error).toBe('string');
      expect(typeof body.code).toBe('string');
    });

    it('should include validation error details when validation fails', async () => {
      const event = createMockEvent({
        httpMethod: 'PATCH',
        path: '/strategies/test-strategy/parameters',
        pathParameters: { id: 'test-strategy' },
        body: JSON.stringify({ parameters: { invalidParam: 'value' } })
      });

      const validationErrors = [
        { field: 'invalidParam', code: 'UNKNOWN_PARAMETER', message: 'Parameter not defined in template' }
      ];

      (StrategyService.updateParameters as jest.Mock).mockRejectedValue(
        new ValidationFailedError('Validation failed', { valid: false, errors: validationErrors })
      );

      const response = await strategiesHandler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(body).toHaveProperty('details');
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details[0]).toHaveProperty('field');
      expect(body.details[0]).toHaveProperty('code');
      expect(body.details[0]).toHaveProperty('message');
    });
  });

  describe('HTTP Status Codes', () => {
    describe('401 Unauthorized', () => {
      it('should return 401 when tenant ID is missing', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/templates',
          headers: {} // No tenant ID
        });

        const response = await templatesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(401);
        expect(body.code).toBe('UNAUTHORIZED');
        expect(body.error).toContain('tenant');
      });
    });

    describe('400 Bad Request', () => {
      it('should return 400 for missing required parameters', async () => {
        const event = createMockEvent({
          httpMethod: 'POST',
          path: '/strategies',
          body: JSON.stringify({ name: 'Test' }) // Missing templateId
        });

        const response = await strategiesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.code).toBe('MISSING_PARAMETER');
        expect(body.details).toBeDefined();
        expect(body.details[0].field).toBe('templateId');
      });

      it('should return 400 for invalid request body', async () => {
        const event = createMockEvent({
          httpMethod: 'POST',
          path: '/strategies',
          body: 'invalid json{'
        });

        const response = await strategiesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.code).toBe('INVALID_BODY');
      });

      it('should return 400 for invalid version number', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/templates/test-template/versions/0',
          pathParameters: { id: 'test-template', version: '0' }
        });

        const response = await templatesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.code).toBe('INVALID_PARAMETER');
      });

      it('should return 400 for invalid deployment mode', async () => {
        const event = createMockEvent({
          httpMethod: 'POST',
          path: '/deployments',
          body: JSON.stringify({
            config: {
              strategyId: 'test-strategy',
              mode: 'INVALID_MODE'
            }
          })
        });

        const response = await deploymentsHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.code).toBe('INVALID_PARAMETER');
        expect(body.details[0].field).toBe('config.mode');
      });

      it('should return 400 for invalid deployment state', async () => {
        const event = createMockEvent({
          httpMethod: 'PATCH',
          path: '/deployments/test-deployment/state',
          pathParameters: { id: 'test-deployment' },
          body: JSON.stringify({ state: 'INVALID_STATE' })
        });

        const response = await deploymentsHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body.code).toBe('INVALID_PARAMETER');
        expect(body.details[0].field).toBe('state');
      });
    });

    describe('404 Not Found', () => {
      it('should return 404 when template not found', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/templates/non-existent',
          pathParameters: { id: 'non-existent' }
        });

        (TemplateRepository.getTemplate as jest.Mock).mockResolvedValue(null);

        const response = await templatesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body.code).toBe('NOT_FOUND');
        expect(body.error).toContain('non-existent');
      });

      it('should return 404 when strategy not found', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/strategies/non-existent',
          pathParameters: { id: 'non-existent' }
        });

        (StrategyService.getStrategy as jest.Mock).mockRejectedValue(
          new ResourceNotFoundError('Strategy', 'non-existent')
        );

        const response = await strategiesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body.code).toBe('NOT_FOUND');
      });

      it('should return 404 when version not found', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/strategies/test-strategy/versions/999',
          pathParameters: { id: 'test-strategy', version: '999' }
        });

        (StrategyService.getVersion as jest.Mock).mockRejectedValue(
          new ResourceNotFoundError('StrategyVersion', 'test-strategy:v999')
        );

        const response = await versionsHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body.code).toBe('NOT_FOUND');
      });

      it('should return 404 for unknown routes', async () => {
        const event = createMockEvent({
          httpMethod: 'GET',
          path: '/unknown/route'
        });

        const response = await templatesHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body.code).toBe('NOT_FOUND');
      });
    });

    describe('409 Conflict', () => {
      it('should return 409 for invalid state transition', async () => {
        const event = createMockEvent({
          httpMethod: 'PATCH',
          path: '/deployments/test-deployment/state',
          pathParameters: { id: 'test-deployment' },
          body: JSON.stringify({ state: 'RUNNING' })
        });

        (DeploymentService.updateState as jest.Mock).mockRejectedValue(
          new InvalidStateTransitionError('STOPPED', 'RUNNING')
        );

        const response = await deploymentsHandler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(409);
        expect(body.code).toBe('INVALID_STATE_TRANSITION');
        expect(body.error).toContain('STOPPED');
        expect(body.error).toContain('RUNNING');
      });
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in all responses', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/templates'
      });

      (TemplateRepository.listTemplates as jest.Mock).mockResolvedValue({ items: [] });

      const response = await templatesHandler(event);

      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const event = createMockEvent({
        httpMethod: 'OPTIONS',
        path: '/templates'
      });

      const response = await templatesHandler(event);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
    });
  });

  describe('Validation Error Details Format', () => {
    it('should format validation errors with field, code, and message', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/deployments',
        body: JSON.stringify({
          config: {
            strategyId: 'test-strategy',
            mode: 'BACKTEST'
            // Missing backtestConfig
          }
        })
      });

      const validationErrors = [
        { field: 'backtestConfig.startDate', code: 'REQUIRED', message: 'startDate is required for BACKTEST mode' },
        { field: 'backtestConfig.endDate', code: 'REQUIRED', message: 'endDate is required for BACKTEST mode' }
      ];

      (DeploymentService.deploy as jest.Mock).mockRejectedValue(
        new DeploymentValidationError('Validation failed', { valid: false, errors: validationErrors })
      );

      const response = await deploymentsHandler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.details).toHaveLength(2);
      
      body.details.forEach((detail: { field: string; code: string; message: string }) => {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('code');
        expect(detail).toHaveProperty('message');
        expect(typeof detail.field).toBe('string');
        expect(typeof detail.code).toBe('string');
        expect(typeof detail.message).toBe('string');
      });
    });
  });

  describe('Success Responses', () => {
    it('should return 200 for successful GET requests', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/templates'
      });

      (TemplateRepository.listTemplates as jest.Mock).mockResolvedValue({ items: [] });

      const response = await templatesHandler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should return 201 for successful POST requests', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        path: '/strategies',
        body: JSON.stringify({ templateId: 'test-template', name: 'Test Strategy' })
      });

      (StrategyService.createStrategy as jest.Mock).mockResolvedValue({
        strategyId: 'new-strategy',
        tenantId: 'test-tenant-123',
        name: 'Test Strategy',
        templateId: 'test-template',
        templateVersion: 1,
        parameters: {},
        currentVersion: 1,
        state: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const response = await strategiesHandler(event);

      expect(response.statusCode).toBe(201);
    });
  });
});
