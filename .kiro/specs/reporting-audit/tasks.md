# Implementation Plan: Reporting & Audit

## Overview

This implementation plan breaks down the Reporting & Audit feature into discrete coding tasks. The plan follows an incremental approach, building core types and interfaces first, then implementing services, and finally wiring everything together with handlers and tests.

## Tasks

- [x] 1. Define core types and interfaces
  - [x] 1.1 Create trade lifecycle types
    - Create `src/types/trade-lifecycle.ts` with TradeEvent, TradeEventType, OrderSnapshot, TriggerCondition interfaces
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.2 Create AI trace types
    - Create `src/types/ai-trace.ts` with AITrace, AIAnalysisType, AIInputSnapshot, DecisionInfluence interfaces
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x] 1.3 Extend risk event types for audit
    - Update `src/types/risk-event.ts` with AuditedRiskEvent, RejectionDetails, ParameterChangeRecord interfaces
    - _Requirements: 3.2, 3.4, 3.5_

  - [x] 1.4 Create data lineage types
    - Create `src/types/data-lineage.ts` with LineageNode, LineageEdge, LineageNodeType interfaces
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 1.5 Create audit package types
    - Create `src/types/audit-package.ts` with AuditPackage, AuditPackageScope, ExportFormat interfaces
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 1.6 Create compliance report types
    - Create `src/types/compliance-report.ts` with ReportTemplate, ComplianceReport, ReportSchedule, ReportSummary interfaces
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 1.7 Create audit query types
    - Create `src/types/audit-query.ts` with AuditQueryFilters, AggregationOptions, PaginatedResult interfaces
    - _Requirements: 7.1, 7.3, 7.4_

  - [x] 1.8 Create retention and access control types
    - Create `src/types/retention.ts` with RetentionPolicy, StorageUsage interfaces
    - Create `src/types/audit-access.ts` with AuditRole, AccessLogEntry, MaskingConfig interfaces
    - _Requirements: 8.1, 9.3, 9.4, 9.5_

  - [x] 1.9 Create real-time streaming types
    - Create `src/types/audit-stream.ts` with StreamSubscription, StreamedAuditEvent, NotificationConfig interfaces
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 2. Checkpoint - Ensure types compile
  - Ensure all types compile, ask the user if questions arise.

- [x] 3. Implement Trade Lifecycle Logger
  - [x] 3.1 Create trade lifecycle repository
    - Create `src/repositories/trade-lifecycle.ts` with S3 storage for trade events
    - Implement tenant-partitioned storage paths
    - _Requirements: 1.1, 1.4_

  - [x] 3.2 Create trade lifecycle service
    - Create `src/services/trade-lifecycle.ts` with logTradeEvent, getTradeLifecycle, getLatencyMetrics
    - Implement correlation ID linking and latency calculation
    - _Requirements: 1.2, 1.3, 1.6_

  - [x] 3.3 Write property tests for trade lifecycle
    - **Property 1: Trade Event Field Completeness**
    - **Property 2: Trade Correlation Integrity**
    - **Property 4: Latency Calculation Accuracy**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

- [x] 4. Implement AI Trace Logger
  - [x] 4.1 Create AI trace repository
    - Create `src/repositories/ai-trace.ts` with S3 storage for AI traces
    - Implement input snapshot storage
    - _Requirements: 2.1, 2.6_

  - [x] 4.2 Create AI trace service
    - Create `src/services/ai-trace.ts` with logAITrace, linkToDecision, recordDecisionInfluence, getReproductionInputs
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x] 4.3 Write property tests for AI trace
    - **Property 5: AI Trace Field Completeness**
    - **Property 6: AI Trace Correlation Linking**
    - **Property 7: AI Input Reproducibility**
    - **Validates: Requirements 2.2, 2.3, 2.5, 2.6**

- [x] 5. Extend Risk Event Service for Audit
  - [x] 5.1 Extend risk event repository
    - Update `src/repositories/risk-event.ts` to store rejection details and parameter changes
    - Add context linking fields
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 5.2 Extend risk event service
    - Update `src/services/risk-event.ts` with logRejection, logParameterChange, linkToContext
    - _Requirements: 3.2, 3.4, 3.5_

  - [x] 5.3 Write property tests for risk event audit
    - **Property 8: Risk Event Field Completeness**
    - **Property 9: Risk Event Context Linking**
    - **Property 10: Parameter Change Audit Trail**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**

- [x] 6. Implement Data Lineage Tracker
  - [x] 6.1 Create data lineage repository
    - Create `src/repositories/data-lineage.ts` with graph storage for lineage nodes and edges
    - _Requirements: 4.1, 4.5_

  - [x] 6.2 Create data lineage service
    - Create `src/services/data-lineage.ts` with recordIngestion, recordTransformation, recordUsage, getForwardLineage, getBackwardLineage
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 6.3 Write property tests for data lineage
    - **Property 11: Data Lineage Completeness**
    - **Property 12: Bidirectional Lineage Traversal**
    - **Validates: Requirements 4.2, 4.4, 4.5**

- [x] 7. Checkpoint - Ensure core services pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Immutable Log Storage
  - [x] 8.1 Create immutable log wrapper
    - Create `src/services/immutable-log.ts` with write-once semantics and modification detection
    - _Requirements: 1.4_

  - [x] 8.2 Write property test for immutability
    - **Property 3: Immutable Log Preservation**
    - **Validates: Requirements 1.4**

- [x] 9. Implement Audit Package Generator
  - [x] 9.1 Create audit package repository
    - Create `src/repositories/audit-package.ts` with package storage and download URL generation
    - _Requirements: 5.6_

  - [x] 9.2 Create audit package service
    - Create `src/services/audit-package.ts` with generatePackage, verifyIntegrity, getDownloadUrl
    - Implement SHA-256 hashing and compression
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 9.3 Implement export format converters
    - Create `src/services/audit-export.ts` with JSON, CSV, and PDF export functions
    - _Requirements: 5.5_

  - [x] 9.4 Write property tests for audit packages
    - **Property 13: Audit Package Completeness and Scope**
    - **Property 14: Package Integrity Hash Verification**
    - **Property 15: Export Format Validity**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 10. Implement Compliance Report Generator
  - [x] 10.1 Create report template repository
    - Create `src/repositories/report-template.ts` with template storage
    - _Requirements: 6.1_

  - [x] 10.2 Create compliance report service
    - Create `src/services/compliance-report.ts` with saveTemplate, generateReport, scheduleReport, getReportHistory
    - Implement summary statistics calculation
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.3 Write property tests for compliance reports
    - **Property 16: Report Template Round-Trip**
    - **Property 17: Report Data Accuracy**
    - **Property 18: Report Generation Logging**
    - **Validates: Requirements 6.1, 6.4, 6.5, 6.6**

- [x] 11. Implement Audit Query Engine
  - [x] 11.1 Create search index integration
    - Create `src/repositories/audit-index.ts` with OpenSearch/Elasticsearch integration
    - _Requirements: 7.5_

  - [x] 11.2 Create audit query service
    - Create `src/services/audit-query.ts` with query, aggregate, search methods
    - Implement pagination and query logging
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6_

  - [x] 11.3 Write property tests for audit queries
    - **Property 19: Query Filter Correctness**
    - **Property 20: Aggregation Accuracy**
    - **Property 21: Pagination Completeness**
    - **Property 22: Full-Text Search Recall**
    - **Property 23: Query Meta-Auditing**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.6**

- [x] 12. Checkpoint - Ensure query and export services pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Retention Manager
  - [x] 13.1 Create retention policy repository
    - Create `src/repositories/retention-policy.ts` with policy storage
    - _Requirements: 8.1_

  - [x] 13.2 Create retention manager service
    - Create `src/services/retention-manager.ts` with setPolicy, archiveExpiredRecords, retrieveArchivedRecords, getStorageUsage, validateDeletion
    - Implement minimum retention enforcement
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 13.3 Write property tests for retention
    - **Property 24: Retention Policy Enforcement**
    - **Property 25: Archive Retrieval Completeness**
    - **Property 26: Deletion Protection**
    - **Validates: Requirements 8.1, 8.3, 8.4, 8.6**

- [x] 14. Implement Access Control Manager
  - [x] 14.1 Create access log repository
    - Create `src/repositories/access-log.ts` with access event storage
    - _Requirements: 9.4_

  - [x] 14.2 Create access control service
    - Create `src/services/audit-access-control.ts` with verifyAccess, getUserRole, logAccess, applyMasking
    - Implement tenant isolation and RBAC
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 14.3 Write property tests for access control
    - **Property 27: Tenant Isolation**
    - **Property 28: Role-Based Access Control**
    - **Property 29: Access Logging Completeness**
    - **Property 30: Data Masking by Role**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 15. Implement Real-Time Audit Streamer
  - [x] 15.1 Create subscription repository
    - Create `src/repositories/audit-subscription.ts` with subscription and buffer storage
    - _Requirements: 10.5, 10.6_

  - [x] 15.2 Create real-time streamer service
    - Create `src/services/audit-streamer.ts` with subscribe, unsubscribe, publishEvent, configureNotifications, getBufferedEvents
    - _Requirements: 10.1, 10.2, 10.4, 10.6_

  - [x] 15.3 Write property tests for streaming
    - **Property 31: Stream Filter Correctness**
    - **Property 32: Critical Event Notification**
    - **Property 33: Concurrent Subscriber Delivery**
    - **Property 34: Event Buffer Replay**
    - **Validates: Requirements 10.2, 10.4, 10.5, 10.6**

- [x] 16. Checkpoint - Ensure all services pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Create test generators
  - [x] 17.1 Add audit test generators
    - Update `src/test/generators.ts` with tradeEventArb, aiTraceArb, lineageNodeArb, auditPackageScopeArb, reportTemplateArb
    - _Requirements: All_

- [x] 18. Implement API handlers
  - [x] 18.1 Create trade lifecycle handlers
    - Create `src/handlers/trade-lifecycle.ts` with POST /audit/trade-events, GET /audit/trade-events/{correlationId}
    - _Requirements: 1.1, 1.3_

  - [x] 18.2 Create AI trace handlers
    - Create `src/handlers/ai-traces.ts` with POST /audit/ai-traces, GET /audit/ai-traces/{traceId}
    - _Requirements: 2.1, 2.3_

  - [x] 18.3 Create data lineage handlers
    - Create `src/handlers/data-lineage.ts` with POST /audit/lineage, GET /audit/lineage/{nodeId}/forward, GET /audit/lineage/{nodeId}/backward
    - _Requirements: 4.1, 4.5_

  - [x] 18.4 Create audit package handlers
    - Create `src/handlers/audit-packages.ts` with POST /audit/packages, GET /audit/packages/{packageId}, GET /audit/packages/{packageId}/download
    - _Requirements: 5.1, 5.6_

  - [x] 18.5 Create compliance report handlers
    - Create `src/handlers/compliance-reports.ts` with POST /audit/reports/templates, POST /audit/reports/generate, GET /audit/reports/{reportId}
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 18.6 Create audit query handlers
    - Update `src/handlers/audit.ts` with enhanced query endpoints supporting filters, aggregation, and full-text search
    - _Requirements: 7.1, 7.3, 7.5_

  - [x] 18.7 Create retention management handlers
    - Create `src/handlers/retention.ts` with POST /audit/retention/policies, GET /audit/storage/usage
    - _Requirements: 8.1, 8.5_

  - [x] 18.8 Create streaming handlers
    - Create `src/handlers/audit-stream.ts` with WebSocket endpoint for real-time audit events
    - _Requirements: 10.1, 10.2_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation builds incrementally: types → repositories → services → handlers
