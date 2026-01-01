import * as fc from 'fast-check';
import {
  ImmutableLogService,
  ImmutableLogViolationError,
  computeContentHash,
  generateImmutableLogKey,
  ImmutableLogRecord
} from './immutable-log';

// Mock the S3 client
jest.mock('aws-sdk', () => {
  const mockS3Instance = {
    putObject: jest.fn().mockReturnThis(),
    getObject: jest.fn().mockReturnThis(),
    headObject: jest.fn().mockReturnThis(),
    promise: jest.fn()
  };
  
  return {
    S3: jest.fn(() => mockS3Instance)
  };
});

// Get the mocked S3 instance
const AWS = require('aws-sdk');
const mockS3 = new AWS.S3();

// In-memory storage for testing immutability
const inMemoryStorage = new Map<string, string>();

describe('Immutable Log Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inMemoryStorage.clear();
    
    // Setup mock implementations
    mockS3.putObject.mockImplementation((params: { Key: string; Body: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        if (inMemoryStorage.has(params.Key)) {
          throw new Error('Record already exists');
        }
        inMemoryStorage.set(params.Key, params.Body);
        return {};
      })
    }));

    mockS3.getObject.mockImplementation((params: { Key: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        const body = inMemoryStorage.get(params.Key);
        if (!body) {
          const error = new Error('NoSuchKey') as Error & { code: string };
          error.code = 'NoSuchKey';
          throw error;
        }
        return { Body: Buffer.from(body) };
      })
    }));

    mockS3.headObject.mockImplementation((params: { Key: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        if (!inMemoryStorage.has(params.Key)) {
          const error = new Error('NotFound') as Error & { code: string };
          error.code = 'NotFound';
          throw error;
        }
        return {};
      })
    }));
  });

  describe('computeContentHash', () => {
    it('should compute consistent hash for same data', () => {
      const data = { name: 'test', value: 123 };
      const hash1 = computeContentHash(data);
      const hash2 = computeContentHash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should compute different hash for different data', () => {
      const data1 = { name: 'test1', value: 123 };
      const data2 = { name: 'test2', value: 456 };
      
      expect(computeContentHash(data1)).not.toBe(computeContentHash(data2));
    });

    it('should compute same hash regardless of key order', () => {
      const data1 = { a: 1, b: 2 };
      const data2 = { b: 2, a: 1 };
      
      expect(computeContentHash(data1)).toBe(computeContentHash(data2));
    });
  });

  describe('generateImmutableLogKey', () => {
    it('should generate correct S3 key path', () => {
      const key = generateImmutableLogKey(
        'tenant-123',
        'trade-events',
        '2024-06-15T10:30:00.000Z',
        'record-456'
      );
      
      expect(key).toBe('audit/tenant-123/trade-events/2024/06/15/record-456.json');
    });
  });

  describe('write', () => {
    it('should write a new immutable record', async () => {
      const data = { orderId: 'order-123', amount: 100 };
      
      const record = await ImmutableLogService.write(
        'tenant-123',
        'trade-events',
        'record-456',
        data
      );

      expect(record.recordId).toBe('record-456');
      expect(record.tenantId).toBe('tenant-123');
      expect(record.recordType).toBe('trade-events');
      expect(record.data).toEqual(data);
      expect(record.contentHash).toBe(computeContentHash(data));
      expect(record.version).toBe(1);
      expect(record.createdAt).toBeDefined();
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify integrity of unmodified record', async () => {
      const data = { orderId: 'order-123', amount: 100 };
      const record = await ImmutableLogService.write(
        'tenant-123',
        'trade-events',
        'record-789',
        data
      );

      const result = await ImmutableLogService.verifyIntegrity(
        'tenant-123',
        'trade-events',
        record.createdAt,
        'record-789'
      );

      expect(result.isValid).toBe(true);
      expect(result.storedHash).toBe(result.computedHash);
      expect(result.error).toBeUndefined();
    });
  });
});


/**
 * Property-Based Tests for Immutable Log Service
 * Feature: reporting-audit
 */
describe('Immutable Log Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inMemoryStorage.clear();
    
    // Setup mock implementations for property tests
    mockS3.putObject.mockImplementation((params: { Key: string; Body: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        if (inMemoryStorage.has(params.Key)) {
          throw new Error('Record already exists');
        }
        inMemoryStorage.set(params.Key, params.Body);
        return {};
      })
    }));

    mockS3.getObject.mockImplementation((params: { Key: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        const body = inMemoryStorage.get(params.Key);
        if (!body) {
          const error = new Error('NoSuchKey') as Error & { code: string };
          error.code = 'NoSuchKey';
          throw error;
        }
        return { Body: Buffer.from(body) };
      })
    }));

    mockS3.headObject.mockImplementation((params: { Key: string }) => ({
      promise: jest.fn().mockImplementation(async () => {
        if (!inMemoryStorage.has(params.Key)) {
          const error = new Error('NotFound') as Error & { code: string };
          error.code = 'NotFound';
          throw error;
        }
        return {};
      })
    }));
  });

  /**
   * Property 3: Immutable Log Preservation
   * 
   * *For any* audit record stored in the system, attempting to modify the record
   * after creation SHALL have no effect on the original stored data—retrieving
   * the record SHALL return the original values.
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 3: Immutable Log Preservation', () => {
    // Helper to normalize -0 to 0 (JSON.stringify converts -0 to 0)
    const normalizeNegativeZero = (value: number): number => 
      Object.is(value, -0) ? 0 : value;

    // Generator for arbitrary audit data
    const auditDataArb = (): fc.Arbitrary<Record<string, unknown>> =>
      fc.record({
        eventId: fc.uuid(),
        eventType: fc.constantFrom('ORDER_CREATED', 'ORDER_FILLED', 'ORDER_CANCELLED'),
        timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .map(d => d.toISOString()),
        amount: fc.double({ min: 0, max: 1000000, noNaN: true }).map(normalizeNegativeZero),
        symbol: fc.constantFrom('BTC', 'ETH', 'SOL'),
        metadata: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(
            fc.string(), 
            fc.double({ noNaN: true }).map(normalizeNegativeZero), 
            fc.boolean()
          ),
          { minKeys: 0, maxKeys: 5 }
        )
      });

    // Generator for modified audit data (different from original)
    const modifiedDataArb = (original: Record<string, unknown>): fc.Arbitrary<Record<string, unknown>> =>
      fc.record({
        eventId: fc.uuid(),
        eventType: fc.constantFrom('ORDER_CREATED', 'ORDER_FILLED', 'ORDER_CANCELLED'),
        timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .map(d => d.toISOString()),
        amount: fc.double({ min: 0, max: 1000000, noNaN: true })
          .filter(v => v !== original.amount), // Ensure different
        symbol: fc.constantFrom('BTC', 'ETH', 'SOL'),
        metadata: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(fc.string(), fc.double({ noNaN: true }), fc.boolean()),
          { minKeys: 0, maxKeys: 5 }
        )
      });

    it('should preserve original data and reject modification attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('trade-events', 'ai-traces', 'risk-events'),
          auditDataArb(),
          async (tenantId, recordId, recordType, originalData) => {
            // Clear storage for each test case
            inMemoryStorage.clear();

            // Step 1: Write the original record
            const originalRecord = await ImmutableLogService.write(
              tenantId,
              recordType,
              recordId,
              originalData
            );

            // Step 2: Read the record back
            const retrievedRecord = await ImmutableLogService.read<Record<string, unknown>>(
              tenantId,
              recordType,
              originalRecord.createdAt,
              recordId
            );

            // Verify the retrieved data matches the original
            expect(retrievedRecord).not.toBeNull();
            expect(retrievedRecord!.data).toEqual(originalData);
            expect(retrievedRecord!.contentHash).toBe(originalRecord.contentHash);

            // Step 3: Attempt to modify the record (should throw)
            const modifiedData = { ...originalData, amount: (originalData.amount as number) + 1000 };
            
            await expect(
              ImmutableLogService.attemptModify(
                tenantId,
                recordType,
                originalRecord.createdAt,
                recordId,
                modifiedData
              )
            ).rejects.toThrow(ImmutableLogViolationError);

            // Step 4: Read the record again - should still have original data
            const recordAfterModifyAttempt = await ImmutableLogService.read<Record<string, unknown>>(
              tenantId,
              recordType,
              originalRecord.createdAt,
              recordId
            );

            // Verify the data is unchanged
            expect(recordAfterModifyAttempt).not.toBeNull();
            expect(recordAfterModifyAttempt!.data).toEqual(originalData);
            expect(recordAfterModifyAttempt!.contentHash).toBe(originalRecord.contentHash);

            // Step 5: Verify integrity check passes
            const integrityResult = await ImmutableLogService.verifyIntegrity(
              tenantId,
              recordType,
              originalRecord.createdAt,
              recordId
            );

            expect(integrityResult.isValid).toBe(true);
            expect(integrityResult.storedHash).toBe(integrityResult.computedHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect tampering via content hash verification', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          auditDataArb(),
          async (tenantId, recordId, originalData) => {
            // Clear storage for each test case
            inMemoryStorage.clear();

            // Write the original record
            const originalRecord = await ImmutableLogService.write(
              tenantId,
              'trade-events',
              recordId,
              originalData
            );

            // Simulate tampering by directly modifying storage
            const key = generateImmutableLogKey(
              tenantId,
              'trade-events',
              originalRecord.createdAt,
              recordId
            );
            
            const storedData = inMemoryStorage.get(key);
            if (storedData) {
              const parsed = JSON.parse(storedData) as ImmutableLogRecord<Record<string, unknown>>;
              // Tamper with the data but keep the old hash
              parsed.data = { ...parsed.data, amount: 999999 };
              inMemoryStorage.set(key, JSON.stringify(parsed));
            }

            // Verify integrity check detects the tampering
            const integrityResult = await ImmutableLogService.verifyIntegrity(
              tenantId,
              'trade-events',
              originalRecord.createdAt,
              recordId
            );

            expect(integrityResult.isValid).toBe(false);
            expect(integrityResult.storedHash).not.toBe(integrityResult.computedHash);
            expect(integrityResult.error).toContain('tampered');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject duplicate writes with same record ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          auditDataArb(),
          auditDataArb(),
          async (tenantId, recordId, data1, data2) => {
            // Clear storage for each test case
            inMemoryStorage.clear();

            // First write should succeed
            const record1 = await ImmutableLogService.write(
              tenantId,
              'trade-events',
              recordId,
              data1
            );

            // Manually set up the key to simulate existing record
            const key = generateImmutableLogKey(
              tenantId,
              'trade-events',
              record1.createdAt,
              recordId
            );

            // Second write with same ID should fail
            // We need to use the same timestamp to hit the same key
            mockS3.headObject.mockImplementationOnce(() => ({
              promise: jest.fn().mockResolvedValue({})
            }));

            await expect(
              ImmutableLogService.write(tenantId, 'trade-events', recordId, data2)
            ).rejects.toThrow(ImmutableLogViolationError);

            // Original record should be unchanged
            const retrieved = await ImmutableLogService.read<Record<string, unknown>>(
              tenantId,
              'trade-events',
              record1.createdAt,
              recordId
            );

            expect(retrieved!.data).toEqual(data1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
