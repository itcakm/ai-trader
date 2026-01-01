/**
 * Property-based tests for Exchange Position Manager Service
 *
 * **Property 25: Position Tracking Granularity**
 * *For any* tenant, positions SHALL be queryable at three levels: per asset per exchange,
 * per asset aggregated across exchanges, and all positions, AND aggregated quantities
 * SHALL equal the sum of exchange-specific quantities.
 *
 * **Validates: Requirements 7.1**
 *
 * **Property 26: Position and P&L Accuracy**
 * *For any* fill received, the Position_Manager SHALL update the position quantity correctly
 * (add for BUY, subtract for SELL), AND recalculate averageEntryPrice using weighted average,
 * AND unrealizedPnL SHALL equal (currentPrice - averageEntryPrice) * quantity.
 *
 * **Validates: Requirements 7.2, 7.5**
 *
 * **Property 27: Position Reconciliation Source of Truth**
 * *For any* position reconciliation that reveals a discrepancy between internal state and
 * exchange data, the system SHALL use exchange data as the source of truth, AND an alert
 * SHALL be generated with discrepancy details.
 *
 * **Validates: Requirements 7.3, 7.4**
 *
 * **Property 28: Position History Tracking**
 * *For any* position change (open, increase, decrease, close, reconcile), a PositionHistory
 * record SHALL be created with previousQuantity, newQuantity, and the triggering event.
 *
 * **Validates: Requirements 7.6**
 */

import * as fc from 'fast-check';
import {
  ExchangePositionManager,
  PositionRepository,
  ExchangeAdapterForPositions,
  DiscrepancyAlertCallback,
} from './exchange-position-manager';
import {
  Position,
  PositionHistory,
  PositionDiscrepancy,
} from '../types/exchange-position';
import { ExecutionUpdate, OrderSide } from '../types/exchange-order';
import { ExchangeId, PositionResponse } from '../types/exchange';
import { generateUUID } from '../utils/uuid';

// ============================================
// Generators
// ============================================

const exchangeIdArb = (): fc.Arbitrary<ExchangeId> =>
  fc.constantFrom('BINANCE', 'COINBASE', 'KRAKEN', 'OKX', 'BSDEX', 'BISON', 'FINOA', 'BYBIT');

const orderSideArb = (): fc.Arbitrary<OrderSide> =>
  fc.constantFrom('BUY', 'SELL');

const cryptoAssetArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'MATIC');

const isoDateStringArb = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for position with valid values
 */
const positionArb = (tenantId?: string, assetId?: string, exchangeId?: ExchangeId): fc.Arbitrary<Position> =>
  fc.record({
    positionId: fc.uuid(),
    tenantId: tenantId ? fc.constant(tenantId) : fc.uuid(),
    assetId: assetId ? fc.constant(assetId) : cryptoAssetArb(),
    exchangeId: exchangeId ? fc.constant(exchangeId) : exchangeIdArb(),
    quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    averageEntryPrice: fc.double({ min: 1, max: 100000, noNaN: true }),
    currentPrice: fc.double({ min: 1, max: 100000, noNaN: true }),
    unrealizedPnL: fc.double({ min: -100000, max: 100000, noNaN: true }),
    unrealizedPnLPercent: fc.double({ min: -100, max: 1000, noNaN: true }),
    realizedPnL: fc.double({ min: -100000, max: 100000, noNaN: true }),
    totalCommissions: fc.double({ min: 0, max: 1000, noNaN: true }),
    openedAt: isoDateStringArb(),
    updatedAt: isoDateStringArb(),
  });

/**
 * Generator for execution update (fill)
 */
const executionUpdateArb = (
  assetId?: string,
  exchangeId?: ExchangeId
): fc.Arbitrary<ExecutionUpdate> =>
  fc.record({
    executionId: fc.uuid(),
    orderId: assetId 
      ? fc.uuid().map(id => `${id}:${assetId}`)
      : fc.tuple(fc.uuid(), cryptoAssetArb()).map(([id, asset]) => `${id}:${asset}`),
    exchangeOrderId: fc.uuid(),
    exchangeId: exchangeId ? fc.constant(exchangeId) : exchangeIdArb(),
    side: orderSideArb(),
    quantity: fc.double({ min: 0.001, max: 100, noNaN: true }),
    price: fc.double({ min: 1, max: 100000, noNaN: true }),
    commission: fc.double({ min: 0, max: 10, noNaN: true }),
    commissionAsset: fc.constant('USDT'),
    timestamp: isoDateStringArb(),
  });

/**
 * Generator for multiple positions across exchanges for the same asset
 */
const multiExchangePositionsArb = (
  tenantId: string,
  assetId: string
): fc.Arbitrary<Position[]> =>
  fc.array(exchangeIdArb(), { minLength: 1, maxLength: 4 })
    .chain(exchanges => {
      const uniqueExchanges = [...new Set(exchanges)];
      return fc.tuple(
        ...uniqueExchanges.map(ex => positionArb(tenantId, assetId, ex))
      );
    })
    .map(positions => positions as Position[]);

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  ExchangePositionManager.clearStores();
});


// ============================================
// Property Tests
// ============================================

describe('Exchange Position Manager', () => {
  describe('Property 25: Position Tracking Granularity', () => {
    /**
     * Feature: exchange-integration, Property 25: Position Tracking Granularity
     *
     * For any tenant, positions SHALL be queryable at three levels:
     * per asset per exchange, per asset aggregated across exchanges, and all positions.
     *
     * **Validates: Requirements 7.1**
     */
    it('should support querying positions at all three granularity levels', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          fc.array(exchangeIdArb(), { minLength: 1, maxLength: 4 }),
          async (tenantId, assetId, exchanges) => {
            // Create unique exchanges
            const uniqueExchanges = [...new Set(exchanges)];
            
            // Create positions on each exchange
            const positions: Position[] = [];
            for (const exchangeId of uniqueExchanges) {
              const position: Position = {
                positionId: generateUUID(),
                tenantId,
                assetId,
                exchangeId,
                quantity: Math.random() * 10 + 0.1,
                averageEntryPrice: Math.random() * 50000 + 1000,
                currentPrice: Math.random() * 50000 + 1000,
                unrealizedPnL: 0,
                unrealizedPnLPercent: 0,
                realizedPnL: 0,
                totalCommissions: 0,
                openedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              positions.push(position);
              await ExchangePositionManager.updatePosition(
                tenantId,
                assetId,
                exchangeId,
                position,
                'OPEN'
              );
            }

            // Level 1: Query per asset per exchange
            for (const exchangeId of uniqueExchanges) {
              const pos = await ExchangePositionManager.getPosition(tenantId, assetId, exchangeId);
              expect(pos).not.toBeNull();
              expect(pos?.assetId).toBe(assetId);
              expect(pos?.exchangeId).toBe(exchangeId);
            }

            // Level 2: Query aggregated across exchanges
            const aggregated = await ExchangePositionManager.getAggregatedPosition(tenantId, assetId);
            expect(aggregated.assetId).toBe(assetId);
            expect(aggregated.positionsByExchange.length).toBe(uniqueExchanges.length);

            // Level 3: Query all positions
            const allPositions = await ExchangePositionManager.listPositions(tenantId);
            expect(allPositions.length).toBe(uniqueExchanges.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 25: Position Tracking Granularity
     *
     * Aggregated quantities SHALL equal the sum of exchange-specific quantities.
     *
     * **Validates: Requirements 7.1**
     */
    it('should have aggregated quantities equal sum of exchange-specific quantities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          fc.array(
            fc.tuple(exchangeIdArb(), fc.double({ min: 0.1, max: 100, noNaN: true })),
            { minLength: 1, maxLength: 5 }
          ),
          async (tenantId, assetId, exchangeQuantities) => {
            // Create unique exchange-quantity pairs
            const exchangeMap = new Map<ExchangeId, number>();
            for (const [exchangeId, quantity] of exchangeQuantities) {
              if (!exchangeMap.has(exchangeId)) {
                exchangeMap.set(exchangeId, quantity);
              }
            }

            // Create positions
            let expectedTotal = 0;
            for (const [exchangeId, quantity] of exchangeMap) {
              expectedTotal += quantity;
              await ExchangePositionManager.updatePosition(
                tenantId,
                assetId,
                exchangeId,
                {
                  quantity,
                  averageEntryPrice: 50000,
                  currentPrice: 50000,
                },
                'OPEN'
              );
            }

            // Get aggregated position
            const aggregated = await ExchangePositionManager.getAggregatedPosition(tenantId, assetId);

            // Verify sum equals total
            const sumOfExchangeQuantities = aggregated.positionsByExchange.reduce(
              (sum, pos) => sum + pos.quantity,
              0
            );

            expect(Math.abs(aggregated.totalQuantity - expectedTotal)).toBeLessThan(0.0001);
            expect(Math.abs(sumOfExchangeQuantities - expectedTotal)).toBeLessThan(0.0001);
            expect(Math.abs(aggregated.totalQuantity - sumOfExchangeQuantities)).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 25: Position Tracking Granularity
     *
     * Positions should be filterable by exchange.
     *
     * **Validates: Requirements 7.1**
     */
    it('should filter positions by exchange correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.tuple(cryptoAssetArb(), exchangeIdArb()),
            { minLength: 2, maxLength: 10 }
          ),
          async (tenantId, assetExchangePairs) => {
            // Create positions
            const createdPositions: Position[] = [];
            for (const [assetId, exchangeId] of assetExchangePairs) {
              const position = await ExchangePositionManager.updatePosition(
                tenantId,
                assetId,
                exchangeId,
                {
                  quantity: 1,
                  averageEntryPrice: 50000,
                  currentPrice: 50000,
                },
                'OPEN'
              );
              createdPositions.push(position);
            }

            // Get unique exchanges
            const uniqueExchanges = [...new Set(assetExchangePairs.map(([_, ex]) => ex))];

            // Filter by each exchange
            for (const exchangeId of uniqueExchanges) {
              const filtered = await ExchangePositionManager.listPositions(tenantId, exchangeId);
              
              // All returned positions should be for this exchange
              for (const pos of filtered) {
                expect(pos.exchangeId).toBe(exchangeId);
              }

              // Count should match expected
              const expectedCount = assetExchangePairs.filter(([_, ex]) => ex === exchangeId).length;
              expect(filtered.length).toBeLessThanOrEqual(expectedCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 26: Position and P&L Accuracy', () => {
    /**
     * Feature: exchange-integration, Property 26: Position and P&L Accuracy
     *
     * For any fill received, the Position_Manager SHALL update the position quantity
     * correctly (add for BUY, subtract for SELL).
     *
     * **Validates: Requirements 7.2, 7.5**
     */
    it('should update position quantity correctly for BUY and SELL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          orderSideArb(),
          async (tenantId, assetId, exchangeId, initialQuantity, fillQuantity, side) => {
            // Create initial position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: initialQuantity,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Create fill
            const fill: ExecutionUpdate = {
              executionId: generateUUID(),
              orderId: `${generateUUID()}:${assetId}`,
              exchangeOrderId: generateUUID(),
              exchangeId,
              side,
              quantity: fillQuantity,
              price: 51000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            // Process fill
            const updatedPosition = await ExchangePositionManager.updatePositionFromFill(tenantId, fill);

            // Verify quantity update
            if (side === 'BUY') {
              expect(Math.abs(updatedPosition.quantity - (initialQuantity + fillQuantity))).toBeLessThan(0.0001);
            } else {
              // SELL
              const expectedQuantity = Math.max(0, initialQuantity - fillQuantity);
              expect(Math.abs(updatedPosition.quantity - expectedQuantity)).toBeLessThan(0.0001);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 26: Position and P&L Accuracy
     *
     * For any fill received, the Position_Manager SHALL recalculate averageEntryPrice
     * using weighted average.
     *
     * **Validates: Requirements 7.2, 7.5**
     */
    it('should calculate weighted average entry price correctly for BUY fills', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 10000, max: 60000, noNaN: true }),
          fc.double({ min: 0.1, max: 50, noNaN: true }),
          fc.double({ min: 10000, max: 60000, noNaN: true }),
          async (tenantId, assetId, exchangeId, initialQty, initialPrice, fillQty, fillPrice) => {
            // Create initial position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: initialQty,
                averageEntryPrice: initialPrice,
                currentPrice: initialPrice,
              },
              'OPEN'
            );

            // Create BUY fill
            const fill: ExecutionUpdate = {
              executionId: generateUUID(),
              orderId: `${generateUUID()}:${assetId}`,
              exchangeOrderId: generateUUID(),
              exchangeId,
              side: 'BUY',
              quantity: fillQty,
              price: fillPrice,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            // Process fill
            const updatedPosition = await ExchangePositionManager.updatePositionFromFill(tenantId, fill);

            // Calculate expected weighted average
            const expectedAvgPrice = (initialQty * initialPrice + fillQty * fillPrice) / (initialQty + fillQty);

            // Verify weighted average
            expect(Math.abs(updatedPosition.averageEntryPrice - expectedAvgPrice)).toBeLessThan(0.01);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 26: Position and P&L Accuracy
     *
     * unrealizedPnL SHALL equal (currentPrice - averageEntryPrice) * quantity.
     *
     * **Validates: Requirements 7.2, 7.5**
     */
    it('should calculate unrealized P&L correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 0.1, max: 100, noNaN: true }),
          fc.double({ min: 10000, max: 60000, noNaN: true }),
          fc.double({ min: 10000, max: 60000, noNaN: true }),
          async (tenantId, assetId, exchangeId, quantity, avgPrice, currentPrice) => {
            // Create position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity,
                averageEntryPrice: avgPrice,
                currentPrice,
              },
              'OPEN'
            );

            // Calculate unrealized P&L
            const unrealizedPnL = await ExchangePositionManager.calculateUnrealizedPnL(
              tenantId,
              assetId,
              currentPrice
            );

            // Expected P&L
            const expectedPnL = quantity * (currentPrice - avgPrice);

            // Verify P&L calculation
            expect(Math.abs(unrealizedPnL - expectedPnL)).toBeLessThan(0.01);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 27: Position Reconciliation Source of Truth', () => {
    /**
     * Feature: exchange-integration, Property 27: Position Reconciliation Source of Truth
     *
     * For any position reconciliation that reveals a discrepancy between internal state
     * and exchange data, the system SHALL use exchange data as the source of truth.
     *
     * **Validates: Requirements 7.3, 7.4**
     */
    it('should use exchange data as source of truth on discrepancy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 1, max: 100, noNaN: true }),
          async (tenantId, assetId, exchangeId, internalQty, exchangeQty) => {
            // Skip if quantities are too close (no meaningful discrepancy)
            if (Math.abs(internalQty - exchangeQty) < 0.001) {
              return;
            }

            // Create internal position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: internalQty,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Create mock adapter that returns different quantity
            const mockAdapter: ExchangeAdapterForPositions = {
              async getPositions(): Promise<PositionResponse[]> {
                return [{
                  exchangeId,
                  assetId,
                  quantity: exchangeQty,
                  averageEntryPrice: 51000,
                  unrealizedPnL: 0,
                  timestamp: new Date().toISOString(),
                }];
              },
            };

            ExchangePositionManager.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Reconcile
            const result = await ExchangePositionManager.reconcilePositions(tenantId, exchangeId);

            // Verify discrepancy was detected
            expect(result.discrepancies.length).toBeGreaterThan(0);

            // Verify exchange data was used as source of truth
            const position = await ExchangePositionManager.getPosition(tenantId, assetId, exchangeId);
            expect(Math.abs(position!.quantity - exchangeQty)).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 27: Position Reconciliation Source of Truth
     *
     * An alert SHALL be generated with discrepancy details.
     *
     * **Validates: Requirements 7.3, 7.4**
     */
    it('should generate alert on discrepancy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 10, max: 100, noNaN: true }),
          fc.double({ min: 1, max: 9, noNaN: true }),
          async (tenantId, assetId, exchangeId, internalQty, exchangeQty) => {
            // Create internal position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: internalQty,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Create mock adapter
            const mockAdapter: ExchangeAdapterForPositions = {
              async getPositions(): Promise<PositionResponse[]> {
                return [{
                  exchangeId,
                  assetId,
                  quantity: exchangeQty,
                  averageEntryPrice: 50000,
                  unrealizedPnL: 0,
                  timestamp: new Date().toISOString(),
                }];
              },
            };

            ExchangePositionManager.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Track alerts
            let alertCalled = false;
            let alertDiscrepancies: PositionDiscrepancy[] = [];

            const alertCallback: DiscrepancyAlertCallback = async (
              _tenantId,
              _exchangeId,
              discrepancies
            ) => {
              alertCalled = true;
              alertDiscrepancies = discrepancies;
            };

            ExchangePositionManager.setAlertCallback(alertCallback);

            // Reconcile
            await ExchangePositionManager.reconcilePositions(tenantId, exchangeId);

            // Verify alert was called with discrepancy details
            expect(alertCalled).toBe(true);
            expect(alertDiscrepancies.length).toBeGreaterThan(0);
            expect(alertDiscrepancies[0].assetId).toBe(assetId);
            expect(alertDiscrepancies[0].internalQuantity).toBeCloseTo(internalQty, 4);
            expect(alertDiscrepancies[0].exchangeQuantity).toBeCloseTo(exchangeQty, 4);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 27: Position Reconciliation Source of Truth
     *
     * Positions found on exchange but not internally should be created.
     *
     * **Validates: Requirements 7.3, 7.4**
     */
    it('should create positions found on exchange but not internally', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 100, noNaN: true }),
          async (tenantId, assetId, exchangeId, exchangeQty) => {
            // No internal position exists

            // Create mock adapter with position
            const mockAdapter: ExchangeAdapterForPositions = {
              async getPositions(): Promise<PositionResponse[]> {
                return [{
                  exchangeId,
                  assetId,
                  quantity: exchangeQty,
                  averageEntryPrice: 50000,
                  unrealizedPnL: 100,
                  timestamp: new Date().toISOString(),
                }];
              },
            };

            ExchangePositionManager.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Reconcile
            const result = await ExchangePositionManager.reconcilePositions(tenantId, exchangeId);

            // Verify position was created
            const position = await ExchangePositionManager.getPosition(tenantId, assetId, exchangeId);
            expect(position).not.toBeNull();
            expect(Math.abs(position!.quantity - exchangeQty)).toBeLessThan(0.0001);

            // Verify adjustment was recorded
            expect(result.adjustmentsMade.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Property 28: Position History Tracking', () => {
    /**
     * Feature: exchange-integration, Property 28: Position History Tracking
     *
     * For any position change (open, increase, decrease, close, reconcile),
     * a PositionHistory record SHALL be created with previousQuantity, newQuantity,
     * and the triggering event.
     *
     * **Validates: Requirements 7.6**
     */
    it('should create history record for OPEN event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 0.1, max: 100, noNaN: true }),
          async (tenantId, assetId, exchangeId, quantity) => {
            // Create new position (OPEN event)
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Get history
            const history = await ExchangePositionManager.getPositionHistory(
              tenantId,
              assetId,
              '2020-01-01T00:00:00.000Z',
              '2030-12-31T23:59:59.999Z'
            );

            // Verify history record
            expect(history.length).toBeGreaterThan(0);
            const openEvent = history.find(h => h.eventType === 'OPEN');
            expect(openEvent).toBeDefined();
            expect(openEvent!.previousQuantity).toBe(0);
            expect(Math.abs(openEvent!.newQuantity - quantity)).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 28: Position History Tracking
     *
     * INCREASE events should be tracked when adding to position.
     *
     * **Validates: Requirements 7.6**
     */
    it('should create history record for INCREASE event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 50, noNaN: true }),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          async (tenantId, assetId, exchangeId, initialQty, addQty) => {
            // Create initial position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: initialQty,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Add to position via BUY fill
            const fill: ExecutionUpdate = {
              executionId: generateUUID(),
              orderId: `${generateUUID()}:${assetId}`,
              exchangeOrderId: generateUUID(),
              exchangeId,
              side: 'BUY',
              quantity: addQty,
              price: 51000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            await ExchangePositionManager.updatePositionFromFill(tenantId, fill);

            // Get history
            const history = await ExchangePositionManager.getPositionHistory(
              tenantId,
              assetId,
              '2020-01-01T00:00:00.000Z',
              '2030-12-31T23:59:59.999Z'
            );

            // Verify INCREASE event
            const increaseEvent = history.find(h => h.eventType === 'INCREASE');
            expect(increaseEvent).toBeDefined();
            expect(Math.abs(increaseEvent!.previousQuantity - initialQty)).toBeLessThan(0.0001);
            expect(Math.abs(increaseEvent!.newQuantity - (initialQty + addQty))).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 28: Position History Tracking
     *
     * DECREASE events should be tracked when reducing position.
     *
     * **Validates: Requirements 7.6**
     */
    it('should create history record for DECREASE event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 10, max: 100, noNaN: true }),
          fc.double({ min: 0.1, max: 5, noNaN: true }),
          async (tenantId, assetId, exchangeId, initialQty, sellQty) => {
            // Create initial position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: initialQty,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Reduce position via SELL fill
            const fill: ExecutionUpdate = {
              executionId: generateUUID(),
              orderId: `${generateUUID()}:${assetId}`,
              exchangeOrderId: generateUUID(),
              exchangeId,
              side: 'SELL',
              quantity: sellQty,
              price: 51000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            await ExchangePositionManager.updatePositionFromFill(tenantId, fill);

            // Get history
            const history = await ExchangePositionManager.getPositionHistory(
              tenantId,
              assetId,
              '2020-01-01T00:00:00.000Z',
              '2030-12-31T23:59:59.999Z'
            );

            // Verify DECREASE event
            const decreaseEvent = history.find(h => h.eventType === 'DECREASE');
            expect(decreaseEvent).toBeDefined();
            expect(Math.abs(decreaseEvent!.previousQuantity - initialQty)).toBeLessThan(0.0001);
            expect(Math.abs(decreaseEvent!.newQuantity - (initialQty - sellQty))).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 28: Position History Tracking
     *
     * CLOSE events should be tracked when position is fully closed.
     *
     * **Validates: Requirements 7.6**
     */
    it('should create history record for CLOSE event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 1, max: 10, noNaN: true }),
          async (tenantId, assetId, exchangeId, quantity) => {
            // Create initial position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Close position via SELL fill for full quantity
            const fill: ExecutionUpdate = {
              executionId: generateUUID(),
              orderId: `${generateUUID()}:${assetId}`,
              exchangeOrderId: generateUUID(),
              exchangeId,
              side: 'SELL',
              quantity: quantity + 1, // Sell more than we have to ensure close
              price: 51000,
              commission: 0.1,
              commissionAsset: 'USDT',
              timestamp: new Date().toISOString(),
            };

            await ExchangePositionManager.updatePositionFromFill(tenantId, fill);

            // Get history
            const history = await ExchangePositionManager.getPositionHistory(
              tenantId,
              assetId,
              '2020-01-01T00:00:00.000Z',
              '2030-12-31T23:59:59.999Z'
            );

            // Verify CLOSE event
            const closeEvent = history.find(h => h.eventType === 'CLOSE');
            expect(closeEvent).toBeDefined();
            expect(closeEvent!.newQuantity).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: exchange-integration, Property 28: Position History Tracking
     *
     * RECONCILE events should be tracked during reconciliation.
     *
     * **Validates: Requirements 7.6**
     */
    it('should create history record for RECONCILE event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          cryptoAssetArb(),
          exchangeIdArb(),
          fc.double({ min: 10, max: 100, noNaN: true }),
          fc.double({ min: 1, max: 9, noNaN: true }),
          async (tenantId, assetId, exchangeId, internalQty, exchangeQty) => {
            // Create internal position
            await ExchangePositionManager.updatePosition(
              tenantId,
              assetId,
              exchangeId,
              {
                quantity: internalQty,
                averageEntryPrice: 50000,
                currentPrice: 50000,
              },
              'OPEN'
            );

            // Create mock adapter with different quantity
            const mockAdapter: ExchangeAdapterForPositions = {
              async getPositions(): Promise<PositionResponse[]> {
                return [{
                  exchangeId,
                  assetId,
                  quantity: exchangeQty,
                  averageEntryPrice: 50000,
                  unrealizedPnL: 0,
                  timestamp: new Date().toISOString(),
                }];
              },
            };

            ExchangePositionManager.registerAdapter(tenantId, exchangeId, mockAdapter);

            // Reconcile
            await ExchangePositionManager.reconcilePositions(tenantId, exchangeId);

            // Get history
            const history = await ExchangePositionManager.getPositionHistory(
              tenantId,
              assetId,
              '2020-01-01T00:00:00.000Z',
              '2030-12-31T23:59:59.999Z'
            );

            // Verify RECONCILE event
            const reconcileEvent = history.find(h => h.eventType === 'RECONCILE');
            expect(reconcileEvent).toBeDefined();
            expect(Math.abs(reconcileEvent!.previousQuantity - internalQty)).toBeLessThan(0.0001);
            expect(Math.abs(reconcileEvent!.newQuantity - exchangeQty)).toBeLessThan(0.0001);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
