/**
 * FIX Protocol Client for Exchange Integration
 *
 * Provides FIX 4.2/4.4 protocol connectivity with:
 * - Session management (logon, logout, heartbeat)
 * - Message sending and receiving
 * - Sequence number tracking
 * - Gap fill request handling
 * - Automatic reconnection with exponential backoff
 * - Message logging for compliance
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import { ExchangeId } from '../../types/exchange';
import { ConnectionStatus, ReconnectionStrategy } from '../../types/exchange-connection';
import { generateUUID } from '../../utils/uuid';

/**
 * FIX Protocol version
 */
export type FIXVersion = '4.2' | '4.4';

/**
 * FIX Session configuration
 */
export interface FIXConfig {
  senderCompId: string;
  targetCompId: string;
  host: string;
  port: number;
  heartbeatIntervalSec: number;
  resetOnLogon: boolean;
  persistMessages: boolean;
  version: FIXVersion;
}

/**
 * Default FIX configuration
 */
export const DEFAULT_FIX_CONFIG: Partial<FIXConfig> = {
  heartbeatIntervalSec: 30,
  resetOnLogon: false,
  persistMessages: true,
  version: '4.4',
};

/**
 * FIX Message structure
 */
export interface FIXMessage {
  msgType: string;
  fields: Record<number, string | number>;
  rawMessage?: string;
}

/**
 * FIX Message types (tag 35)
 */
export const FIXMsgType = {
  HEARTBEAT: '0',
  TEST_REQUEST: '1',
  RESEND_REQUEST: '2',
  REJECT: '3',
  SEQUENCE_RESET: '4',
  LOGOUT: '5',
  LOGON: 'A',
  NEW_ORDER_SINGLE: 'D',
  ORDER_CANCEL_REQUEST: 'F',
  ORDER_CANCEL_REPLACE_REQUEST: 'G',
  ORDER_STATUS_REQUEST: 'H',
  EXECUTION_REPORT: '8',
  ORDER_CANCEL_REJECT: '9',
} as const;

/**
 * FIX Standard tags
 */
export const FIXTag = {
  BEGIN_STRING: 8,
  BODY_LENGTH: 9,
  MSG_TYPE: 35,
  SENDER_COMP_ID: 49,
  TARGET_COMP_ID: 56,
  MSG_SEQ_NUM: 34,
  SENDING_TIME: 52,
  CHECKSUM: 10,
  ENCRYPT_METHOD: 98,
  HEARTBEAT_INT: 108,
  RESET_SEQ_NUM_FLAG: 141,
  TEST_REQ_ID: 112,
  REF_SEQ_NUM: 45,
  TEXT: 58,
  BEGIN_SEQ_NO: 7,
  END_SEQ_NO: 16,
  GAP_FILL_FLAG: 123,
  NEW_SEQ_NO: 36,
  // Order-related tags
  CL_ORD_ID: 11,
  ORDER_ID: 37,
  EXEC_ID: 17,
  EXEC_TYPE: 150,
  ORD_STATUS: 39,
  SYMBOL: 55,
  SIDE: 54,
  ORDER_QTY: 38,
  ORD_TYPE: 40,
  PRICE: 44,
  STOP_PX: 99,
  TIME_IN_FORCE: 59,
  TRANSACT_TIME: 60,
  LAST_QTY: 32,
  LAST_PX: 31,
  LEAVES_QTY: 151,
  CUM_QTY: 14,
  AVG_PX: 6,
  COMMISSION: 12,
  COMMISSION_TYPE: 13,
  ORIG_CL_ORD_ID: 41,
  ORD_REJ_REASON: 103,
  CXL_REJ_REASON: 102,
  CXL_REJ_RESPONSE_TO: 434,
} as const;


/**
 * FIX Session state
 */
export interface FIXSessionState {
  sessionId: string;
  status: ConnectionStatus;
  outgoingSeqNum: number;
  incomingSeqNum: number;
  lastSentTime?: string;
  lastReceivedTime?: string;
  loggedOn: boolean;
  testRequestId?: string;
  pendingResend: boolean;
}

/**
 * FIX Message log entry
 */
export interface FIXMessageLog {
  logId: string;
  sessionId: string;
  direction: 'SENT' | 'RECEIVED';
  msgType: string;
  seqNum: number;
  rawMessage: string;
  timestamp: string;
}

/**
 * Reconnection options for FIX client
 */
export interface FIXReconnectOptions {
  enabled: boolean;
  strategy: ReconnectionStrategy;
}

/**
 * Default reconnection strategy
 */
export const DEFAULT_FIX_RECONNECT_STRATEGY: ReconnectionStrategy = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 10,
  jitterPercent: 10,
};

/**
 * Error thrown by FIX client operations
 */
export class FIXClientError extends Error {
  constructor(
    message: string,
    public readonly exchangeId: ExchangeId,
    public readonly sessionId?: string,
    public readonly retryable: boolean = false,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'FIXClientError';
  }
}

/**
 * FIX Protocol Client
 *
 * Handles FIX 4.2/4.4 protocol communication with exchanges.
 * Manages session lifecycle, sequence numbers, and message logging.
 */
export class FIXClient extends EventEmitter {
  private readonly exchangeId: ExchangeId;
  private readonly config: FIXConfig;
  private readonly reconnectOptions: FIXReconnectOptions;
  
  private socket: net.Socket | null = null;
  private sessionState: FIXSessionState;
  private messageBuffer: string = '';
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private testRequestTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts: number = 0;
  
  // Message logging
  private messageLogs: FIXMessageLog[] = [];
  private readonly maxLogSize: number = 10000;

  constructor(
    exchangeId: ExchangeId,
    config: FIXConfig,
    reconnectOptions?: Partial<FIXReconnectOptions>
  ) {
    super();
    this.exchangeId = exchangeId;
    this.config = { ...DEFAULT_FIX_CONFIG, ...config } as FIXConfig;
    this.reconnectOptions = {
      enabled: reconnectOptions?.enabled ?? true,
      strategy: reconnectOptions?.strategy ?? DEFAULT_FIX_RECONNECT_STRATEGY,
    };
    
    this.sessionState = this.createInitialSessionState();
  }

  /**
   * Create initial session state
   */
  private createInitialSessionState(): FIXSessionState {
    return {
      sessionId: generateUUID(),
      status: 'DISCONNECTED',
      outgoingSeqNum: 1,
      incomingSeqNum: 1,
      loggedOn: false,
      pendingResend: false,
    };
  }

  /**
   * Connect to FIX server
   */
  async connect(): Promise<void> {
    if (this.sessionState.status === 'CONNECTED' || this.sessionState.status === 'CONNECTING') {
      return;
    }

    this.sessionState.status = 'CONNECTING';
    this.emit('connecting', { sessionId: this.sessionState.sessionId });

    return new Promise((resolve, reject) => {
      try {
        this.socket = new net.Socket();

        this.socket.on('connect', () => {
          this.sessionState.status = 'CONNECTED';
          this.reconnectAttempts = 0;
          this.emit('connected', { sessionId: this.sessionState.sessionId });
          resolve();
        });

        this.socket.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        this.socket.on('close', (hadError: boolean) => {
          this.handleClose(hadError);
        });

        this.socket.on('error', (error: Error) => {
          this.handleError(error);
          if (this.sessionState.status === 'CONNECTING') {
            reject(new FIXClientError(
              `Failed to connect to FIX server: ${error.message}`,
              this.exchangeId,
              this.sessionState.sessionId,
              true,
              error
            ));
          }
        });

        this.socket.connect(this.config.port, this.config.host);
      } catch (error) {
        this.sessionState.status = 'ERROR';
        reject(new FIXClientError(
          'Failed to create socket connection',
          this.exchangeId,
          this.sessionState.sessionId,
          true,
          error
        ));
      }
    });
  }

  /**
   * Disconnect from FIX server
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.sessionState.loggedOn) {
      try {
        await this.logout();
      } catch {
        // Ignore logout errors during disconnect
      }
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.sessionState.status = 'DISCONNECTED';
    this.sessionState.loggedOn = false;
    this.emit('disconnected', { sessionId: this.sessionState.sessionId });
  }

  /**
   * Send FIX logon message
   */
  async logon(): Promise<void> {
    if (!this.socket || this.sessionState.status !== 'CONNECTED') {
      throw new FIXClientError(
        'Cannot logon: not connected',
        this.exchangeId,
        this.sessionState.sessionId,
        false
      );
    }

    const fields: Record<number, string | number> = {
      [FIXTag.ENCRYPT_METHOD]: 0, // No encryption
      [FIXTag.HEARTBEAT_INT]: this.config.heartbeatIntervalSec,
    };

    if (this.config.resetOnLogon) {
      fields[FIXTag.RESET_SEQ_NUM_FLAG] = 'Y';
      this.sessionState.outgoingSeqNum = 1;
      this.sessionState.incomingSeqNum = 1;
    }

    const message: FIXMessage = {
      msgType: FIXMsgType.LOGON,
      fields,
    };

    await this.sendMessage(message);
    
    // Wait for logon acknowledgment
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new FIXClientError(
          'Logon timeout',
          this.exchangeId,
          this.sessionState.sessionId,
          true
        ));
      }, 30000);

      const onLogon = () => {
        clearTimeout(timeout);
        this.startHeartbeat();
        resolve();
      };

      const onReject = (data: { reason: string }) => {
        clearTimeout(timeout);
        reject(new FIXClientError(
          `Logon rejected: ${data.reason}`,
          this.exchangeId,
          this.sessionState.sessionId,
          false
        ));
      };

      this.once('logonAck', onLogon);
      this.once('logonReject', onReject);
    });
  }

  /**
   * Send FIX logout message
   */
  async logout(): Promise<void> {
    if (!this.sessionState.loggedOn) {
      return;
    }

    this.stopHeartbeat();

    const message: FIXMessage = {
      msgType: FIXMsgType.LOGOUT,
      fields: {},
    };

    await this.sendMessage(message);
    this.sessionState.loggedOn = false;
    this.emit('loggedOut', { sessionId: this.sessionState.sessionId });
  }

  /**
   * Send a FIX message
   */
  async sendMessage(message: FIXMessage): Promise<void> {
    if (!this.socket || this.sessionState.status !== 'CONNECTED') {
      throw new FIXClientError(
        'Cannot send message: not connected',
        this.exchangeId,
        this.sessionState.sessionId,
        false
      );
    }

    const rawMessage = this.buildRawMessage(message);
    
    // Log the message
    this.logMessage('SENT', message.msgType, this.sessionState.outgoingSeqNum, rawMessage);
    
    // Increment sequence number
    this.sessionState.outgoingSeqNum++;
    this.sessionState.lastSentTime = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.socket!.write(rawMessage, (error) => {
        if (error) {
          reject(new FIXClientError(
            `Failed to send message: ${error.message}`,
            this.exchangeId,
            this.sessionState.sessionId,
            true,
            error
          ));
        } else {
          this.emit('messageSent', { msgType: message.msgType, seqNum: this.sessionState.outgoingSeqNum - 1 });
          resolve();
        }
      });
    });
  }

  /**
   * Send heartbeat message
   */
  async sendHeartbeat(testReqId?: string): Promise<void> {
    const fields: Record<number, string | number> = {};
    
    if (testReqId) {
      fields[FIXTag.TEST_REQ_ID] = testReqId;
    }

    const message: FIXMessage = {
      msgType: FIXMsgType.HEARTBEAT,
      fields,
    };

    await this.sendMessage(message);
  }

  /**
   * Request resend of messages
   */
  async requestResend(beginSeqNo: number, endSeqNo: number): Promise<void> {
    const message: FIXMessage = {
      msgType: FIXMsgType.RESEND_REQUEST,
      fields: {
        [FIXTag.BEGIN_SEQ_NO]: beginSeqNo,
        [FIXTag.END_SEQ_NO]: endSeqNo,
      },
    };

    this.sessionState.pendingResend = true;
    await this.sendMessage(message);
    this.emit('resendRequested', { beginSeqNo, endSeqNo });
  }


  /**
   * Build raw FIX message string
   */
  private buildRawMessage(message: FIXMessage): string {
    const SOH = '\x01'; // FIX field delimiter
    const beginString = this.config.version === '4.2' ? 'FIX.4.2' : 'FIX.4.4';
    
    // Build body first (everything except BeginString, BodyLength, and Checksum)
    const bodyFields: string[] = [
      `${FIXTag.MSG_TYPE}=${message.msgType}`,
      `${FIXTag.SENDER_COMP_ID}=${this.config.senderCompId}`,
      `${FIXTag.TARGET_COMP_ID}=${this.config.targetCompId}`,
      `${FIXTag.MSG_SEQ_NUM}=${this.sessionState.outgoingSeqNum}`,
      `${FIXTag.SENDING_TIME}=${this.formatTimestamp(new Date())}`,
    ];

    // Add message-specific fields
    for (const [tag, value] of Object.entries(message.fields)) {
      bodyFields.push(`${tag}=${value}`);
    }

    const body = bodyFields.join(SOH) + SOH;
    const bodyLength = body.length;

    // Build header
    const header = `${FIXTag.BEGIN_STRING}=${beginString}${SOH}${FIXTag.BODY_LENGTH}=${bodyLength}${SOH}`;

    // Calculate checksum
    const messageWithoutChecksum = header + body;
    const checksum = this.calculateChecksum(messageWithoutChecksum);

    return messageWithoutChecksum + `${FIXTag.CHECKSUM}=${checksum}${SOH}`;
  }

  /**
   * Calculate FIX checksum
   */
  private calculateChecksum(message: string): string {
    let sum = 0;
    for (let i = 0; i < message.length; i++) {
      sum += message.charCodeAt(i);
    }
    return (sum % 256).toString().padStart(3, '0');
  }

  /**
   * Format timestamp for FIX protocol
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', '-').replace('Z', '').replace(/\.\d{3}/, '');
  }

  /**
   * Handle incoming data
   */
  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();
    this.processMessageBuffer();
  }

  /**
   * Process message buffer and extract complete messages
   */
  private processMessageBuffer(): void {
    const SOH = '\x01';
    
    while (true) {
      // Find the end of a message (checksum field followed by SOH)
      const checksumMatch = this.messageBuffer.match(/10=\d{3}\x01/);
      if (!checksumMatch) {
        break;
      }

      const messageEnd = checksumMatch.index! + checksumMatch[0].length;
      const rawMessage = this.messageBuffer.substring(0, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);

      try {
        const message = this.parseMessage(rawMessage);
        this.handleMessage(message, rawMessage);
      } catch (error) {
        this.emit('parseError', { rawMessage, error });
      }
    }
  }

  /**
   * Parse raw FIX message into structured format
   */
  parseMessage(rawMessage: string): FIXMessage {
    const SOH = '\x01';
    const fields: Record<number, string | number> = {};
    let msgType = '';

    const parts = rawMessage.split(SOH).filter(p => p.length > 0);
    
    for (const part of parts) {
      const [tagStr, value] = part.split('=');
      const tag = parseInt(tagStr, 10);
      
      if (isNaN(tag)) continue;

      if (tag === FIXTag.MSG_TYPE) {
        msgType = value;
      } else {
        // Try to parse as number, otherwise keep as string
        const numValue = parseFloat(value);
        fields[tag] = isNaN(numValue) ? value : numValue;
      }
    }

    return { msgType, fields, rawMessage };
  }

  /**
   * Handle parsed FIX message
   */
  private handleMessage(message: FIXMessage, rawMessage: string): void {
    const seqNum = message.fields[FIXTag.MSG_SEQ_NUM] as number;
    
    // Log received message
    this.logMessage('RECEIVED', message.msgType, seqNum, rawMessage);
    
    this.sessionState.lastReceivedTime = new Date().toISOString();

    // Check sequence number
    if (seqNum && !this.sessionState.pendingResend) {
      if (seqNum > this.sessionState.incomingSeqNum) {
        // Gap detected - request resend
        this.requestResend(this.sessionState.incomingSeqNum, seqNum - 1);
      } else if (seqNum < this.sessionState.incomingSeqNum) {
        // Duplicate or old message - ignore unless it's a sequence reset
        if (message.msgType !== FIXMsgType.SEQUENCE_RESET) {
          return;
        }
      }
      this.sessionState.incomingSeqNum = seqNum + 1;
    }

    // Handle message by type
    switch (message.msgType) {
      case FIXMsgType.LOGON:
        this.handleLogon(message);
        break;
      case FIXMsgType.LOGOUT:
        this.handleLogout(message);
        break;
      case FIXMsgType.HEARTBEAT:
        this.handleHeartbeat(message);
        break;
      case FIXMsgType.TEST_REQUEST:
        this.handleTestRequest(message);
        break;
      case FIXMsgType.RESEND_REQUEST:
        this.handleResendRequest(message);
        break;
      case FIXMsgType.SEQUENCE_RESET:
        this.handleSequenceReset(message);
        break;
      case FIXMsgType.REJECT:
        this.handleReject(message);
        break;
      case FIXMsgType.EXECUTION_REPORT:
        this.emit('executionReport', message);
        break;
      case FIXMsgType.ORDER_CANCEL_REJECT:
        this.emit('orderCancelReject', message);
        break;
      default:
        this.emit('message', message);
    }
  }

  /**
   * Handle logon response
   */
  private handleLogon(message: FIXMessage): void {
    this.sessionState.loggedOn = true;
    this.emit('logonAck', { message });
    this.emit('loggedOn', { sessionId: this.sessionState.sessionId });
  }

  /**
   * Handle logout message
   */
  private handleLogout(message: FIXMessage): void {
    const text = message.fields[FIXTag.TEXT] as string;
    this.sessionState.loggedOn = false;
    this.stopHeartbeat();
    this.emit('logoutReceived', { reason: text });
    
    // Send logout acknowledgment if we didn't initiate
    if (this.socket && this.sessionState.status === 'CONNECTED') {
      this.sendMessage({
        msgType: FIXMsgType.LOGOUT,
        fields: {},
      }).catch(() => {});
    }
  }

  /**
   * Handle heartbeat message
   */
  private handleHeartbeat(message: FIXMessage): void {
    const testReqId = message.fields[FIXTag.TEST_REQ_ID] as string;
    
    // Clear test request timer if this is a response
    if (testReqId && testReqId === this.sessionState.testRequestId) {
      if (this.testRequestTimer) {
        clearTimeout(this.testRequestTimer);
        this.testRequestTimer = undefined;
      }
      this.sessionState.testRequestId = undefined;
    }
    
    this.emit('heartbeat', { testReqId });
  }

  /**
   * Handle test request - respond with heartbeat
   */
  private handleTestRequest(message: FIXMessage): void {
    const testReqId = message.fields[FIXTag.TEST_REQ_ID] as string;
    this.sendHeartbeat(testReqId).catch((error) => {
      this.emit('error', { error, context: 'testRequestResponse' });
    });
  }

  /**
   * Handle resend request
   */
  private handleResendRequest(message: FIXMessage): void {
    const beginSeqNo = message.fields[FIXTag.BEGIN_SEQ_NO] as number;
    const endSeqNo = message.fields[FIXTag.END_SEQ_NO] as number;
    
    // For simplicity, send a gap fill (sequence reset)
    // In production, you would resend actual messages from persistent storage
    this.sendGapFill(beginSeqNo, this.sessionState.outgoingSeqNum).catch((error) => {
      this.emit('error', { error, context: 'resendRequest' });
    });
    
    this.emit('resendRequest', { beginSeqNo, endSeqNo });
  }

  /**
   * Send gap fill message
   */
  private async sendGapFill(beginSeqNo: number, newSeqNo: number): Promise<void> {
    const message: FIXMessage = {
      msgType: FIXMsgType.SEQUENCE_RESET,
      fields: {
        [FIXTag.GAP_FILL_FLAG]: 'Y',
        [FIXTag.NEW_SEQ_NO]: newSeqNo,
      },
    };

    // Temporarily set sequence number for gap fill
    const savedSeqNum = this.sessionState.outgoingSeqNum;
    this.sessionState.outgoingSeqNum = beginSeqNo;
    
    await this.sendMessage(message);
    
    this.sessionState.outgoingSeqNum = savedSeqNum;
  }

  /**
   * Handle sequence reset
   */
  private handleSequenceReset(message: FIXMessage): void {
    const newSeqNo = message.fields[FIXTag.NEW_SEQ_NO] as number;
    const gapFill = message.fields[FIXTag.GAP_FILL_FLAG] === 'Y';
    
    if (newSeqNo) {
      this.sessionState.incomingSeqNum = newSeqNo;
    }
    
    if (gapFill) {
      this.sessionState.pendingResend = false;
    }
    
    this.emit('sequenceReset', { newSeqNo, gapFill });
  }

  /**
   * Handle reject message
   */
  private handleReject(message: FIXMessage): void {
    const refSeqNum = message.fields[FIXTag.REF_SEQ_NUM] as number;
    const text = message.fields[FIXTag.TEXT] as string;
    
    this.emit('reject', { refSeqNum, reason: text, message });
  }


  /**
   * Handle socket close
   */
  private handleClose(hadError: boolean): void {
    this.stopHeartbeat();
    const wasLoggedOn = this.sessionState.loggedOn;
    this.sessionState.loggedOn = false;
    this.socket = null;

    if (this.sessionState.status !== 'DISCONNECTED') {
      this.sessionState.status = 'DISCONNECTED';
      this.emit('close', { hadError, sessionId: this.sessionState.sessionId });

      // Attempt reconnection if enabled and was previously logged on
      if (this.reconnectOptions.enabled && wasLoggedOn) {
        this.attemptReconnection();
      }
    }
  }

  /**
   * Handle socket error
   */
  private handleError(error: Error): void {
    this.emit('error', { error, sessionId: this.sessionState.sessionId });
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnection(): Promise<void> {
    const strategy = this.reconnectOptions.strategy;

    if (this.reconnectAttempts >= strategy.maxAttempts) {
      this.sessionState.status = 'ERROR';
      this.emit('reconnectFailed', {
        sessionId: this.sessionState.sessionId,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.sessionState.status = 'RECONNECTING';
    this.reconnectAttempts++;

    const delay = this.calculateReconnectDelay(this.reconnectAttempts - 1, strategy);

    this.emit('reconnecting', {
      sessionId: this.sessionState.sessionId,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    await this.sleep(delay);

    try {
      await this.connect();
      await this.logon();
      
      this.emit('reconnected', {
        sessionId: this.sessionState.sessionId,
        attempts: this.reconnectAttempts,
      });
    } catch (error) {
      // Retry again
      this.attemptReconnection();
    }
  }

  /**
   * Calculate reconnection delay with exponential backoff and jitter
   */
  calculateReconnectDelay(attempt: number, strategy: ReconnectionStrategy): number {
    const baseDelay = strategy.initialDelayMs * Math.pow(strategy.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, strategy.maxDelayMs);

    // Add jitter
    const jitterFactor = 1 + (Math.random() * strategy.jitterPercent * 2 - strategy.jitterPercent) / 100;
    return Math.floor(cappedDelay * jitterFactor);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    const intervalMs = this.config.heartbeatIntervalSec * 1000;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch((error) => {
        this.emit('error', { error, context: 'heartbeat' });
      });

      // Set test request timer to detect connection issues
      this.sessionState.testRequestId = generateUUID();
      this.testRequestTimer = setTimeout(() => {
        this.handleHeartbeatTimeout();
      }, intervalMs);
    }, intervalMs);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.testRequestTimer) {
      clearTimeout(this.testRequestTimer);
      this.testRequestTimer = undefined;
    }
  }

  /**
   * Handle heartbeat timeout
   */
  private handleHeartbeatTimeout(): void {
    this.emit('heartbeatTimeout', { sessionId: this.sessionState.sessionId });
    
    // Close connection to trigger reconnection
    if (this.socket) {
      this.socket.destroy();
    }
  }

  /**
   * Log FIX message
   */
  private logMessage(
    direction: 'SENT' | 'RECEIVED',
    msgType: string,
    seqNum: number,
    rawMessage: string
  ): void {
    if (!this.config.persistMessages) {
      return;
    }

    const log: FIXMessageLog = {
      logId: generateUUID(),
      sessionId: this.sessionState.sessionId,
      direction,
      msgType,
      seqNum,
      rawMessage,
      timestamp: new Date().toISOString(),
    };

    this.messageLogs.push(log);
    
    // Trim logs if exceeding max size
    if (this.messageLogs.length > this.maxLogSize) {
      this.messageLogs = this.messageLogs.slice(-this.maxLogSize);
    }

    this.emit('messageLogged', log);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // Public Getters
  // ============================================

  /**
   * Get exchange ID
   */
  getExchangeId(): ExchangeId {
    return this.exchangeId;
  }

  /**
   * Get session state
   */
  getSessionState(): FIXSessionState {
    return { ...this.sessionState };
  }

  /**
   * Get configuration
   */
  getConfig(): FIXConfig {
    return { ...this.config };
  }

  /**
   * Check if logged on
   */
  isLoggedOn(): boolean {
    return this.sessionState.loggedOn;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.sessionState.status === 'CONNECTED';
  }

  /**
   * Get message logs
   */
  getMessageLogs(limit?: number): FIXMessageLog[] {
    if (limit) {
      return this.messageLogs.slice(-limit);
    }
    return [...this.messageLogs];
  }

  /**
   * Get message logs by direction
   */
  getMessageLogsByDirection(direction: 'SENT' | 'RECEIVED', limit?: number): FIXMessageLog[] {
    const filtered = this.messageLogs.filter(log => log.direction === direction);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Get message logs by message type
   */
  getMessageLogsByType(msgType: string, limit?: number): FIXMessageLog[] {
    const filtered = this.messageLogs.filter(log => log.msgType === msgType);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Clear message logs
   */
  clearMessageLogs(): void {
    this.messageLogs = [];
  }

  /**
   * Get current outgoing sequence number
   */
  getOutgoingSeqNum(): number {
    return this.sessionState.outgoingSeqNum;
  }

  /**
   * Get current incoming sequence number
   */
  getIncomingSeqNum(): number {
    return this.sessionState.incomingSeqNum;
  }

  /**
   * Set sequence numbers (for recovery)
   */
  setSequenceNumbers(outgoing: number, incoming: number): void {
    this.sessionState.outgoingSeqNum = outgoing;
    this.sessionState.incomingSeqNum = incoming;
  }

  /**
   * Get reconnect options
   */
  getReconnectOptions(): FIXReconnectOptions {
    return { ...this.reconnectOptions };
  }
}
