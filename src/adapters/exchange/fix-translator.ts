/**
 * FIX Order Translator for Exchange Integration
 *
 * Translates between internal order format and FIX message format.
 * Supports:
 * - NewOrderSingle (35=D) creation
 * - OrderCancelRequest (35=F) creation
 * - OrderCancelReplaceRequest (35=G) creation
 * - ExecutionReport (35=8) parsing
 * - OrderCancelReject (35=9) parsing
 *
 * Requirements: 4.3
 */

import {
  OrderRequest,
  OrderModification,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,
  ExecutionUpdate,
  CancelResponse,
} from '../../types/exchange-order';
import { ExchangeId } from '../../types/exchange';
import { FIXMessage, FIXMsgType, FIXTag } from './fix-client';
import { generateUUID } from '../../utils/uuid';

/**
 * FIX Order Side values
 */
export const FIXSide = {
  BUY: '1',
  SELL: '2',
} as const;

/**
 * FIX Order Type values
 */
export const FIXOrdType = {
  MARKET: '1',
  LIMIT: '2',
  STOP: '3',
  STOP_LIMIT: '4',
} as const;

/**
 * FIX Time In Force values
 */
export const FIXTimeInForce = {
  DAY: '0',
  GTC: '1',
  IOC: '3',
  FOK: '4',
  GTD: '6',
} as const;

/**
 * FIX Execution Type values
 */
export const FIXExecType = {
  NEW: '0',
  PARTIAL_FILL: '1',
  FILL: '2',
  DONE_FOR_DAY: '3',
  CANCELED: '4',
  REPLACED: '5',
  PENDING_CANCEL: '6',
  STOPPED: '7',
  REJECTED: '8',
  SUSPENDED: '9',
  PENDING_NEW: 'A',
  CALCULATED: 'B',
  EXPIRED: 'C',
  RESTATED: 'D',
  PENDING_REPLACE: 'E',
  TRADE: 'F',
} as const;

/**
 * FIX Order Status values
 */
export const FIXOrdStatus = {
  NEW: '0',
  PARTIALLY_FILLED: '1',
  FILLED: '2',
  DONE_FOR_DAY: '3',
  CANCELED: '4',
  REPLACED: '5',
  PENDING_CANCEL: '6',
  STOPPED: '7',
  REJECTED: '8',
  SUSPENDED: '9',
  PENDING_NEW: 'A',
  CALCULATED: 'B',
  EXPIRED: 'C',
  PENDING_REPLACE: 'E',
} as const;

/**
 * FIX Cancel Reject Response To values
 */
export const FIXCxlRejResponseTo = {
  ORDER_CANCEL_REQUEST: '1',
  ORDER_CANCEL_REPLACE_REQUEST: '2',
} as const;

/**
 * Error thrown by FIX translator operations
 */
export class FIXTranslatorError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly originalValue?: unknown
  ) {
    super(message);
    this.name = 'FIXTranslatorError';
  }
}

/**
 * FIX Order Translator
 *
 * Handles bidirectional translation between internal order format
 * and FIX protocol message format.
 */
export class FIXOrderTranslator {
  private readonly exchangeId: ExchangeId;

  constructor(exchangeId: ExchangeId) {
    this.exchangeId = exchangeId;
  }

  /**
   * Convert OrderRequest to FIX NewOrderSingle message
   */
  toFIXNewOrderSingle(order: OrderRequest): FIXMessage {
    const fields: Record<number, string | number> = {
      [FIXTag.CL_ORD_ID]: order.orderId,
      [FIXTag.SYMBOL]: order.assetId,
      [FIXTag.SIDE]: this.toFIXSide(order.side),
      [FIXTag.ORDER_QTY]: order.quantity,
      [FIXTag.ORD_TYPE]: this.toFIXOrderType(order.orderType),
      [FIXTag.TIME_IN_FORCE]: this.toFIXTimeInForce(order.timeInForce),
      [FIXTag.TRANSACT_TIME]: this.formatTimestamp(new Date()),
    };

    // Add price for LIMIT orders
    if (order.orderType === 'LIMIT' || order.orderType === 'STOP_LIMIT') {
      if (order.price === undefined) {
        throw new FIXTranslatorError(
          'Price is required for LIMIT and STOP_LIMIT orders',
          'price',
          order.price
        );
      }
      fields[FIXTag.PRICE] = order.price;
    }

    // Add stop price for STOP orders
    if (order.orderType === 'STOP_LIMIT' || order.orderType === 'STOP_MARKET') {
      if (order.stopPrice === undefined) {
        throw new FIXTranslatorError(
          'Stop price is required for STOP orders',
          'stopPrice',
          order.stopPrice
        );
      }
      fields[FIXTag.STOP_PX] = order.stopPrice;
    }

    // Add expiration for GTD orders
    if (order.timeInForce === 'GTD' && order.expiresAt) {
      fields[FIXTag.TRANSACT_TIME] = this.formatTimestamp(new Date(order.expiresAt));
    }

    return {
      msgType: FIXMsgType.NEW_ORDER_SINGLE,
      fields,
    };
  }

  /**
   * Convert to FIX OrderCancelRequest message
   */
  toFIXOrderCancelRequest(orderId: string, exchangeOrderId: string, symbol: string, side: OrderSide, quantity: number): FIXMessage {
    const fields: Record<number, string | number> = {
      [FIXTag.ORIG_CL_ORD_ID]: orderId,
      [FIXTag.CL_ORD_ID]: generateUUID(), // New unique ID for cancel request
      [FIXTag.ORDER_ID]: exchangeOrderId,
      [FIXTag.SYMBOL]: symbol,
      [FIXTag.SIDE]: this.toFIXSide(side),
      [FIXTag.ORDER_QTY]: quantity,
      [FIXTag.TRANSACT_TIME]: this.formatTimestamp(new Date()),
    };

    return {
      msgType: FIXMsgType.ORDER_CANCEL_REQUEST,
      fields,
    };
  }

  /**
   * Convert to FIX OrderCancelReplaceRequest message
   */
  toFIXOrderCancelReplaceRequest(
    orderId: string,
    exchangeOrderId: string,
    symbol: string,
    side: OrderSide,
    orderType: OrderType,
    modifications: OrderModification
  ): FIXMessage {
    const fields: Record<number, string | number> = {
      [FIXTag.ORIG_CL_ORD_ID]: orderId,
      [FIXTag.CL_ORD_ID]: generateUUID(), // New unique ID for replace request
      [FIXTag.ORDER_ID]: exchangeOrderId,
      [FIXTag.SYMBOL]: symbol,
      [FIXTag.SIDE]: this.toFIXSide(side),
      [FIXTag.ORD_TYPE]: this.toFIXOrderType(orderType),
      [FIXTag.TRANSACT_TIME]: this.formatTimestamp(new Date()),
    };

    // Add modified fields
    if (modifications.newQuantity !== undefined) {
      fields[FIXTag.ORDER_QTY] = modifications.newQuantity;
    }

    if (modifications.newPrice !== undefined) {
      fields[FIXTag.PRICE] = modifications.newPrice;
    }

    if (modifications.newStopPrice !== undefined) {
      fields[FIXTag.STOP_PX] = modifications.newStopPrice;
    }

    return {
      msgType: FIXMsgType.ORDER_CANCEL_REPLACE_REQUEST,
      fields,
    };
  }


  /**
   * Parse FIX ExecutionReport message to ExecutionUpdate
   */
  fromFIXExecutionReport(message: FIXMessage): ExecutionUpdate {
    if (message.msgType !== FIXMsgType.EXECUTION_REPORT) {
      throw new FIXTranslatorError(
        `Expected ExecutionReport (35=8), got ${message.msgType}`,
        'msgType',
        message.msgType
      );
    }

    const fields = message.fields;

    // Extract required fields
    const execId = fields[FIXTag.EXEC_ID];
    const clOrdId = fields[FIXTag.CL_ORD_ID];
    const orderId = fields[FIXTag.ORDER_ID];
    const side = fields[FIXTag.SIDE];
    const lastQty = fields[FIXTag.LAST_QTY];
    const lastPx = fields[FIXTag.LAST_PX];
    const transactTime = fields[FIXTag.TRANSACT_TIME];

    // Validate required fields
    if (execId === undefined) {
      throw new FIXTranslatorError('Missing ExecID (17)', 'execId');
    }
    if (clOrdId === undefined) {
      throw new FIXTranslatorError('Missing ClOrdID (11)', 'clOrdId');
    }

    // Extract optional fields with defaults
    const commission = fields[FIXTag.COMMISSION] as number ?? 0;
    const commissionType = fields[FIXTag.COMMISSION_TYPE] as string ?? '3'; // Default to absolute

    return {
      executionId: String(execId),
      orderId: String(clOrdId),
      exchangeOrderId: orderId !== undefined ? String(orderId) : '',
      exchangeId: this.exchangeId,
      side: this.fromFIXSide(side),
      quantity: Number(lastQty) || 0,
      price: Number(lastPx) || 0,
      commission: Number(commission),
      commissionAsset: this.getCommissionAsset(commissionType),
      timestamp: transactTime ? this.parseTimestamp(String(transactTime)) : new Date().toISOString(),
    };
  }

  /**
   * Parse FIX OrderCancelReject message to CancelResponse
   */
  fromFIXOrderCancelReject(message: FIXMessage): CancelResponse {
    if (message.msgType !== FIXMsgType.ORDER_CANCEL_REJECT) {
      throw new FIXTranslatorError(
        `Expected OrderCancelReject (35=9), got ${message.msgType}`,
        'msgType',
        message.msgType
      );
    }

    const fields = message.fields;

    const clOrdId = fields[FIXTag.CL_ORD_ID];
    const origClOrdId = fields[FIXTag.ORIG_CL_ORD_ID];
    const orderId = fields[FIXTag.ORDER_ID];
    const cxlRejReason = fields[FIXTag.CXL_REJ_REASON];
    const text = fields[FIXTag.TEXT];

    return {
      orderId: origClOrdId !== undefined ? String(origClOrdId) : String(clOrdId),
      exchangeOrderId: orderId !== undefined ? String(orderId) : '',
      status: 'FAILED',
      reason: text !== undefined ? String(text) : this.getCancelRejectReason(cxlRejReason),
    };
  }

  /**
   * Extract OrderStatus from ExecutionReport
   */
  getOrderStatusFromExecutionReport(message: FIXMessage): OrderStatus {
    const ordStatus = message.fields[FIXTag.ORD_STATUS];
    return this.fromFIXOrderStatus(ordStatus);
  }

  /**
   * Check if ExecutionReport represents a fill
   */
  isFillExecution(message: FIXMessage): boolean {
    const execType = message.fields[FIXTag.EXEC_TYPE];
    return execType === FIXExecType.FILL ||
           execType === FIXExecType.PARTIAL_FILL ||
           execType === FIXExecType.TRADE;
  }

  /**
   * Extract fill details from ExecutionReport
   */
  getFillDetails(message: FIXMessage): { quantity: number; price: number; cumQty: number; leavesQty: number; avgPx: number } {
    const fields = message.fields;
    
    return {
      quantity: Number(fields[FIXTag.LAST_QTY]) || 0,
      price: Number(fields[FIXTag.LAST_PX]) || 0,
      cumQty: Number(fields[FIXTag.CUM_QTY]) || 0,
      leavesQty: Number(fields[FIXTag.LEAVES_QTY]) || 0,
      avgPx: Number(fields[FIXTag.AVG_PX]) || 0,
    };
  }

  // ============================================
  // Conversion Helpers
  // ============================================

  /**
   * Convert internal OrderSide to FIX Side
   */
  toFIXSide(side: OrderSide): string {
    switch (side) {
      case 'BUY':
        return FIXSide.BUY;
      case 'SELL':
        return FIXSide.SELL;
      default:
        throw new FIXTranslatorError(`Unknown order side: ${side}`, 'side', side);
    }
  }

  /**
   * Convert FIX Side to internal OrderSide
   */
  fromFIXSide(side: unknown): OrderSide {
    switch (String(side)) {
      case FIXSide.BUY:
      case '1':
        return 'BUY';
      case FIXSide.SELL:
      case '2':
        return 'SELL';
      default:
        return 'BUY'; // Default to BUY for unknown
    }
  }

  /**
   * Convert internal OrderType to FIX OrdType
   */
  toFIXOrderType(orderType: OrderType): string {
    switch (orderType) {
      case 'MARKET':
        return FIXOrdType.MARKET;
      case 'LIMIT':
        return FIXOrdType.LIMIT;
      case 'STOP_MARKET':
        return FIXOrdType.STOP;
      case 'STOP_LIMIT':
        return FIXOrdType.STOP_LIMIT;
      case 'TRAILING_STOP':
        // FIX doesn't have a standard trailing stop type, use stop
        return FIXOrdType.STOP;
      default:
        throw new FIXTranslatorError(`Unknown order type: ${orderType}`, 'orderType', orderType);
    }
  }

  /**
   * Convert FIX OrdType to internal OrderType
   */
  fromFIXOrderType(ordType: unknown): OrderType {
    switch (String(ordType)) {
      case FIXOrdType.MARKET:
      case '1':
        return 'MARKET';
      case FIXOrdType.LIMIT:
      case '2':
        return 'LIMIT';
      case FIXOrdType.STOP:
      case '3':
        return 'STOP_MARKET';
      case FIXOrdType.STOP_LIMIT:
      case '4':
        return 'STOP_LIMIT';
      default:
        return 'MARKET'; // Default to MARKET for unknown
    }
  }

  /**
   * Convert internal TimeInForce to FIX TimeInForce
   */
  toFIXTimeInForce(tif: TimeInForce): string {
    switch (tif) {
      case 'GTC':
        return FIXTimeInForce.GTC;
      case 'IOC':
        return FIXTimeInForce.IOC;
      case 'FOK':
        return FIXTimeInForce.FOK;
      case 'GTD':
        return FIXTimeInForce.GTD;
      default:
        throw new FIXTranslatorError(`Unknown time in force: ${tif}`, 'timeInForce', tif);
    }
  }

  /**
   * Convert FIX TimeInForce to internal TimeInForce
   */
  fromFIXTimeInForce(tif: unknown): TimeInForce {
    switch (String(tif)) {
      case FIXTimeInForce.GTC:
      case '1':
        return 'GTC';
      case FIXTimeInForce.IOC:
      case '3':
        return 'IOC';
      case FIXTimeInForce.FOK:
      case '4':
        return 'FOK';
      case FIXTimeInForce.GTD:
      case '6':
        return 'GTD';
      case FIXTimeInForce.DAY:
      case '0':
      default:
        return 'GTC'; // Default to GTC
    }
  }

  /**
   * Convert FIX OrdStatus to internal OrderStatus
   */
  fromFIXOrderStatus(ordStatus: unknown): OrderStatus {
    switch (String(ordStatus)) {
      case FIXOrdStatus.NEW:
      case FIXOrdStatus.PENDING_NEW:
      case '0':
      case 'A':
        return 'OPEN';
      case FIXOrdStatus.PARTIALLY_FILLED:
      case '1':
        return 'PARTIALLY_FILLED';
      case FIXOrdStatus.FILLED:
      case '2':
        return 'FILLED';
      case FIXOrdStatus.CANCELED:
      case FIXOrdStatus.PENDING_CANCEL:
      case '4':
      case '6':
        return 'CANCELLED';
      case FIXOrdStatus.REJECTED:
      case '8':
        return 'REJECTED';
      case FIXOrdStatus.EXPIRED:
      case 'C':
        return 'EXPIRED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Format timestamp for FIX protocol
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', '-').replace('Z', '').replace(/\.\d{3}/, '');
  }

  /**
   * Parse FIX timestamp to ISO string
   */
  private parseTimestamp(fixTimestamp: string): string {
    // FIX format: YYYYMMDD-HH:MM:SS or YYYYMMDD-HH:MM:SS.sss
    try {
      const normalized = fixTimestamp.replace('-', 'T') + 'Z';
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch {
      // Fall through to default
    }
    return new Date().toISOString();
  }

  /**
   * Get commission asset from commission type
   */
  private getCommissionAsset(commissionType: string): string {
    // Commission type 3 = absolute, typically in quote currency
    // For crypto, default to USDT
    return 'USDT';
  }

  /**
   * Get cancel reject reason text
   */
  private getCancelRejectReason(reason: unknown): string {
    switch (String(reason)) {
      case '0':
        return 'Too late to cancel';
      case '1':
        return 'Unknown order';
      case '2':
        return 'Broker/Exchange option';
      case '3':
        return 'Order already in pending cancel or pending replace status';
      case '4':
        return 'Unable to process Order Mass Cancel Request';
      case '5':
        return 'OrigOrdModTime did not match last TransactTime of order';
      case '6':
        return 'Duplicate ClOrdID received';
      case '99':
        return 'Other';
      default:
        return 'Unknown rejection reason';
    }
  }

  /**
   * Get exchange ID
   */
  getExchangeId(): ExchangeId {
    return this.exchangeId;
  }
}
