# Implementation Plan: Strategy Management

## Overview

This plan implements the Strategy Management feature using TypeScript with AWS Lambda, DynamoDB, and API Gateway. Tasks are organized to build incrementally, starting with core data models and validation, then services, and finally wiring everything together.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Initialize TypeScript project with Jest and fast-check
    - Create package.json with dependencies: aws-sdk, fast-check, jest, ts-jest, typescript
    - Configure tsconfig.json for ES2020 target
    - Configure jest.config.js for TypeScript and fast-check
    - _Requirements: N/A (infrastructure)_
  - [x] 1.2 Create core type definitions
    - Create `src/types/template.ts` with StrategyTemplate, ParameterDefinition, HardBounds interfaces
    - Create `src/types/strategy.ts` with Strategy, StrategyVersion, ParameterValue, StrategyState types
    - Create `src/types/deployment.ts` with Deployment, DeploymentConfig, DeploymentMode, DeploymentState types
    - Create `src/types/validation.ts` with ValidationResult, ValidationError interfaces
    - _Requirements: 1.3, 1.4, 2.5, 4.1_
  - [x] 1.3 Write property test for type structure completeness
    - **Property 1: Template Structure Completeness**
    - **Validates: Requirements 1.3, 1.4**

- [x] 2. Implement validation service
  - [x] 2.1 Create parameter validation logic
    - Create `src/services/validation.ts`
    - Implement `validateParameter()` for type checking and bounds validation
    - Implement `validateHardBounds()` for numeric min/max and string pattern checks
    - _Requirements: 2.2, 2.3, 6.1, 6.2_
  - [x] 2.2 Write property test for parameter bounds validation
    - **Property 4: Parameter Bounds Validation**
    - **Validates: Requirements 2.2, 2.3**
  - [x] 2.3 Implement strategy validation logic
    - Implement `validateStrategy()` for complete strategy validation
    - Implement `validateParameterCombinations()` for logical consistency checks
    - _Requirements: 6.1, 6.2, 6.5_
  - [x] 2.4 Write property test for parameter combination consistency
    - **Property 16: Parameter Combination Consistency**
    - **Validates: Requirements 6.5**
  - [x] 2.5 Implement deployment validation logic
    - Implement `validateDeployment()` for mode-specific validation
    - Validate BACKTEST requires date range, LIVE requires risk controls
    - _Requirements: 4.1, 4.2, 4.4_
  - [x] 2.6 Write property test for deployment mode validation
    - **Property 11: Deployment Mode Validation**
    - **Validates: Requirements 4.1, 4.2, 4.4**
  - [x] 2.7 Write property test for validation error details
    - **Property 15: Validation Error Details**
    - **Validates: Requirements 6.4**

- [x] 3. Checkpoint - Validation service complete
  - Ensure all validation tests pass, ask the user if questions arise.

- [x] 4. Implement serialization and persistence layer
  - [x] 4.1 Create DynamoDB client and table configurations
    - Create `src/db/client.ts` with DynamoDB DocumentClient setup
    - Create `src/db/tables.ts` with table name constants and key schemas
    - _Requirements: 5.1_
  - [x] 4.2 Implement strategy serialization/deserialization
    - Create `src/serialization/strategy.ts`
    - Implement `serializeStrategy()` to convert Strategy to JSON
    - Implement `deserializeStrategy()` to convert JSON to Strategy
    - _Requirements: 5.2, 5.3_
  - [x] 4.3 Write property test for strategy persistence round-trip
    - **Property 5: Strategy Persistence Round-Trip**
    - **Validates: Requirements 2.4, 2.6, 5.2, 5.3**
  - [x] 4.4 Implement tenant isolation in data access
    - Create `src/db/access.ts` with tenant-scoped query helpers
    - Ensure all queries include tenantId in partition key
    - _Requirements: 5.4_
  - [x] 4.5 Write property test for tenant isolation
    - **Property 12: Tenant Isolation**
    - **Validates: Requirements 5.4**

- [x] 5. Implement template service
  - [x] 5.1 Create template repository
    - Create `src/repositories/template.ts`
    - Implement `getTemplate()`, `listTemplates()`, `getTemplateVersion()`
    - _Requirements: 1.1, 1.2_
  - [x] 5.2 Implement template versioning logic
    - Implement version creation on template updates
    - Ensure previous versions are preserved
    - _Requirements: 1.5_
  - [x] 5.3 Write property test for template versioning
    - **Property 2: Template Versioning Preserves History**
    - **Validates: Requirements 1.5**

- [x] 6. Implement strategy service
  - [x] 6.1 Create strategy repository
    - Create `src/repositories/strategy.ts`
    - Implement CRUD operations with tenant isolation
    - _Requirements: 2.4, 2.6, 5.4_
  - [x] 6.2 Implement strategy creation from template
    - Create `src/services/strategy.ts`
    - Implement `createStrategy()` that initializes parameters from template defaults
    - _Requirements: 2.1_
  - [x] 6.3 Write property test for strategy initialization
    - **Property 3: Strategy Initialization from Template**
    - **Validates: Requirements 2.1**
  - [x] 6.4 Implement parameter update with validation
    - Implement `updateParameters()` with bounds validation
    - Reject invalid values and preserve original on failure
    - _Requirements: 2.2, 2.3_
  - [x] 6.5 Implement strategy-template reference tracking
    - Ensure strategies maintain templateId and templateVersion
    - Validate template reference on retrieval
    - _Requirements: 2.5, 6.3_
  - [x] 6.6 Write property test for template reference integrity
    - **Property 6: Strategy-Template Reference Integrity**
    - **Validates: Requirements 2.5**
  - [x] 6.7 Write property test for template reference validation on deployment
    - **Property 14: Template Reference Validation on Deployment**
    - **Validates: Requirements 6.3**

- [x] 7. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement versioning service
  - [x] 8.1 Create version repository
    - Create `src/repositories/version.ts`
    - Implement version storage and retrieval
    - _Requirements: 3.1, 3.4_
  - [x] 8.2 Implement version creation on save
    - Integrate version creation into strategy save flow
    - Implement version number incrementing
    - _Requirements: 3.1, 3.6_
  - [x] 8.3 Write property test for version incrementing
    - **Property 7: Version Number Incrementing**
    - **Validates: Requirements 3.1**
  - [x] 8.4 Implement version immutability
    - Ensure versions cannot be modified after creation
    - Return copies rather than mutable references
    - _Requirements: 3.2_
  - [x] 8.5 Write property test for version immutability
    - **Property 8: Version Immutability**
    - **Validates: Requirements 3.2**
  - [x] 8.6 Implement version history retrieval
    - Implement `getVersionHistory()` with ordering by creation time
    - Implement `getVersion()` for specific version retrieval
    - _Requirements: 3.3, 3.4_
  - [x] 8.7 Write property test for version history ordering
    - **Property 9: Version History Ordering**
    - **Validates: Requirements 3.3, 3.4**
  - [x] 8.8 Implement rollback functionality
    - Implement `rollbackToVersion()` that creates new version with old config
    - _Requirements: 3.5_
  - [x] 8.9 Write property test for rollback behavior
    - **Property 10: Rollback Creates New Version**
    - **Validates: Requirements 3.5**

- [x] 9. Implement deployment service
  - [x] 9.1 Create deployment repository
    - Create `src/repositories/deployment.ts`
    - Implement deployment storage and retrieval
    - _Requirements: 4.5_
  - [x] 9.2 Implement deployment creation with validation
    - Create `src/services/deployment.ts`
    - Implement `deploy()` with mode-specific validation
    - _Requirements: 4.1, 4.2, 4.4_
  - [x] 9.3 Implement deployment state management
    - Implement `updateState()` for state transitions
    - Track deployment state changes
    - _Requirements: 4.5, 4.6, 4.7_
  - [x] 9.4 Write unit tests for deployment state transitions
    - Test PAUSED and STOPPED state transitions
    - _Requirements: 4.6, 4.7_

- [x] 10. Implement Lambda handlers
  - [x] 10.1 Create template API handlers
    - Create `src/handlers/templates.ts`
    - Implement GET /templates, GET /templates/{id}, GET /templates/{id}/versions/{version}
    - _Requirements: 1.1, 1.2_
  - [x] 10.2 Create strategy API handlers
    - Create `src/handlers/strategies.ts`
    - Implement CRUD endpoints for strategies
    - _Requirements: 2.1, 2.4, 2.6_
  - [x] 10.3 Create version API handlers
    - Create `src/handlers/versions.ts`
    - Implement GET /strategies/{id}/versions, POST /strategies/{id}/rollback
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 10.4 Create deployment API handlers
    - Create `src/handlers/deployments.ts`
    - Implement POST /deployments, PATCH /deployments/{id}/state
    - _Requirements: 4.1, 4.5, 4.6, 4.7_
  - [x] 10.5 Write unit tests for error response formatting
    - Verify HTTP status codes and error message structure
    - _Requirements: 6.4_

- [x] 11. Checkpoint - All handlers complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Create test generators and integration tests
  - [x] 12.1 Create fast-check generators
    - Create `src/test/generators.ts`
    - Implement generators for Template, Strategy, Parameter, Deployment
    - _Requirements: N/A (testing infrastructure)_
  - [x] 12.2 Write integration tests for strategy lifecycle
    - Test create → configure → version → deploy flow
    - _Requirements: 2.1, 2.4, 3.1, 4.1_
  - [x] 12.3 Write property test for parameter validation completeness
    - **Property 13: Parameter Validation Completeness**
    - **Validates: Requirements 6.1, 6.2**

- [x] 13. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks are all required for comprehensive testing from the start
- Each task references specific requirements for traceability
- Property tests use fast-check library with minimum 100 iterations
- Checkpoints ensure incremental validation before proceeding
