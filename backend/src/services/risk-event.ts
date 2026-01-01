import { generateUUID } from '../utils/uuid';
import {
  RiskEvent,
  RiskEventInput,
  RiskEventFilters,
  RiskEventStats,
  RiskEventType,
  RiskEventSeverity,
  AlertConfig,
  AlertChannel,
  AuditedRiskEvent,
  AuditedRiskEventInput,
  RejectionDetails,
  ParameterChangeRecord,
  MarketConditionSnapshot,
  FailedCheck
} from '../types/risk-event';
import { OrderSnapshot } from '../types/trade-lifecycle';
import { RiskEventRepository } from '../repositories/risk-event';

/**
 * Severity levels in order of priority (for threshold comparison)
 */
const SEVERITY_ORDER: Record<RiskEventSeverity, number> = {
  'INFO': 0,
  'WARNING': 1,
  'CRITICAL': 2,
  'EMERGENCY': 3
};

/**
 * Alert sender callback type
 */
export type AlertSender = (channel: AlertChannel, event: RiskEvent) => Promise<void>;

/**
 * Default alert sender (logs to console)
 */
const defaultAlertSender: AlertSender = async (channel: AlertChannel, event: RiskEvent) => {
  console.log(`[ALERT] ${channel.type} to ${channel.destination}: ${event.eventType} - ${event.description}`);
};

/**
 * Risk Event Service - manages risk event logging and alerting
 * 
 * Provides comprehensive logging of all risk events with:
 * - Full event details including trigger conditions and actions taken
 * - JSON serialization for storage and retrieval
 * - Configurable alerting based on severity and event type
 * - Tenant isolation for all queries
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export const RiskEventService = {
  /**
   * Alert sender function (can be overridden for testing or custom implementations)
   */
  alertSender: defaultAlertSender as AlertSender,

  /**
   * Set custom alert sender
   */
  setAlertSender(sender: AlertSender): void {
    this.alertSender = sender;
  },

  /**
   * Reset to default alert sender
   */
  resetAlertSender(): void {
    this.alertSender = defaultAlertSender;
  },

  /**
   * Log a risk event with all required fields
   * 
   * Requirements: 10.1, 10.2
   * 
   * @param input - The risk event input
   * @returns The created risk event
   */
  async logEvent(input: RiskEventInput): Promise<RiskEvent> {
    const eventId = generateUUID();
    const timestamp = new Date().toISOString();

    const event: RiskEvent = {
      eventId,
      tenantId: input.tenantId,
      eventType: input.eventType,
      severity: input.severity,
      strategyId: input.strategyId,
      assetId: input.assetId,
      description: input.description,
      triggerCondition: input.triggerCondition,
      actionTaken: input.actionTaken,
      metadata: input.metadata || {},
      timestamp
    };

    // Store the event
    await RiskEventRepository.putEvent(event);

    // Check if we need to send alerts
    await this.checkAndSendAlerts(event);

    return event;
  },

  /**
   * Get risk events for a tenant with optional filters
   * 
   * Requirements: 10.4 (tenant isolation)
   * 
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters
   * @returns Array of risk events
   */
  async getEvents(tenantId: string, filters: RiskEventFilters): Promise<RiskEvent[]> {
    const result = await RiskEventRepository.listEvents(tenantId, filters);
    return result.items;
  },

  /**
   * Get event statistics for a tenant
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant identifier
   * @param period - Period string (e.g., '24h', '7d', '30d')
   * @returns Event statistics
   */
  async getEventStats(tenantId: string, period: string): Promise<RiskEventStats> {
    const { startTime, endTime } = this.parsePeriod(period);
    return RiskEventRepository.getEventStats(tenantId, startTime, endTime);
  },

  /**
   * Parse period string into start and end times
   */
  parsePeriod(period: string): { startTime: string; endTime: string } {
    const endTime = new Date().toISOString();
    let startTime: Date;

    const match = period.match(/^(\d+)([hdwm])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const now = new Date();

      switch (unit) {
        case 'h':
          startTime = new Date(now.getTime() - value * 60 * 60 * 1000);
          break;
        case 'd':
          startTime = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          startTime = new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          startTime = new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default 24h
      }
    } else {
      // Default to 24 hours
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    return {
      startTime: startTime.toISOString(),
      endTime
    };
  },

  /**
   * Configure alerts for a tenant
   * 
   * Requirements: 10.3
   * 
   * @param tenantId - The tenant identifier
   * @param config - The alert configuration
   */
  async configureAlerts(tenantId: string, config: AlertConfig): Promise<void> {
    await RiskEventRepository.putAlertConfig(tenantId, config);
  },

  /**
   * Get alert configuration for a tenant
   * 
   * @param tenantId - The tenant identifier
   * @returns The alert configuration, or null if not configured
   */
  async getAlertConfig(tenantId: string): Promise<AlertConfig | null> {
    return RiskEventRepository.getAlertConfig(tenantId);
  },

  /**
   * Check if an event should trigger alerts and send them
   * 
   * Requirements: 10.3
   * 
   * @param event - The risk event
   */
  async checkAndSendAlerts(event: RiskEvent): Promise<void> {
    const config = await RiskEventRepository.getAlertConfig(event.tenantId);
    
    if (!config) {
      return; // No alert config, skip alerting
    }

    // Check if event severity meets threshold
    if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[config.severityThreshold]) {
      return; // Severity below threshold
    }

    // Check if event type is in the configured list
    if (config.eventTypes.length > 0 && !config.eventTypes.includes(event.eventType)) {
      return; // Event type not in configured list
    }

    // Send alerts to all enabled channels
    await this.sendAlert(event, config);
  },

  /**
   * Send alert for a risk event
   * 
   * Requirements: 10.3
   * 
   * @param event - The risk event
   * @param config - Optional alert config (will be fetched if not provided)
   */
  async sendAlert(event: RiskEvent, config?: AlertConfig): Promise<void> {
    const alertConfig = config || await RiskEventRepository.getAlertConfig(event.tenantId);
    
    if (!alertConfig) {
      return;
    }

    const enabledChannels = alertConfig.channels.filter(c => c.enabled);
    
    for (const channel of enabledChannels) {
      try {
        await this.alertSender(channel, event);
      } catch (error) {
        console.error(`Failed to send alert via ${channel.type} to ${channel.destination}:`, error);
      }
    }
  },

  /**
   * Serialize a risk event to JSON
   * 
   * Requirements: 10.2
   * 
   * @param event - The risk event
   * @returns JSON string
   */
  serializeEvent(event: RiskEvent): string {
    return JSON.stringify(event);
  },

  /**
   * Deserialize a risk event from JSON
   * 
   * Requirements: 10.2
   * 
   * @param json - The JSON string
   * @returns The risk event
   */
  deserializeEvent(json: string): RiskEvent {
    return JSON.parse(json) as RiskEvent;
  },

  /**
   * Validate that serialization round-trip preserves all data
   * 
   * Requirements: 10.2
   * 
   * @param event - The risk event
   * @returns True if round-trip preserves data
   */
  validateRoundTrip(event: RiskEvent): boolean {
    const serialized = this.serializeEvent(event);
    const deserialized = this.deserializeEvent(serialized);
    
    return (
      deserialized.eventId === event.eventId &&
      deserialized.tenantId === event.tenantId &&
      deserialized.eventType === event.eventType &&
      deserialized.severity === event.severity &&
      deserialized.strategyId === event.strategyId &&
      deserialized.assetId === event.assetId &&
      deserialized.description === event.description &&
      deserialized.triggerCondition === event.triggerCondition &&
      deserialized.actionTaken === event.actionTaken &&
      deserialized.timestamp === event.timestamp &&
      JSON.stringify(deserialized.metadata) === JSON.stringify(event.metadata)
    );
  },

  // ==================== Aggregation Operations ====================

  /**
   * Get aggregated event data for trend analysis
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant identifier
   * @param period - Period string
   * @param groupBy - Field to group by ('eventType', 'severity', 'hour', 'day')
   * @returns Aggregated data
   */
  async getAggregatedEvents(
    tenantId: string,
    period: string,
    groupBy: 'eventType' | 'severity' | 'hour' | 'day'
  ): Promise<Record<string, number>> {
    const { startTime, endTime } = this.parsePeriod(period);
    const result = await RiskEventRepository.listEvents(tenantId, {
      startTime,
      endTime,
      limit: 10000
    });

    const aggregated: Record<string, number> = {};

    for (const event of result.items) {
      let key: string;

      switch (groupBy) {
        case 'eventType':
          key = event.eventType;
          break;
        case 'severity':
          key = event.severity;
          break;
        case 'hour':
          key = event.timestamp.substring(0, 13); // YYYY-MM-DDTHH
          break;
        case 'day':
          key = event.timestamp.substring(0, 10); // YYYY-MM-DD
          break;
        default:
          key = 'unknown';
      }

      aggregated[key] = (aggregated[key] || 0) + 1;
    }

    return aggregated;
  },

  /**
   * Get trend data for a specific event type
   * 
   * Requirements: 10.6
   * 
   * @param tenantId - The tenant identifier
   * @param eventType - The event type
   * @param period - Period string
   * @returns Array of { timestamp, count } objects
   */
  async getEventTrend(
    tenantId: string,
    eventType: RiskEventType,
    period: string
  ): Promise<Array<{ timestamp: string; count: number }>> {
    const { startTime, endTime } = this.parsePeriod(period);
    const result = await RiskEventRepository.listEvents(tenantId, {
      startTime,
      endTime,
      eventTypes: [eventType],
      limit: 10000
    });

    // Group by hour
    const hourlyData: Record<string, number> = {};

    for (const event of result.items) {
      const hour = event.timestamp.substring(0, 13); // YYYY-MM-DDTHH
      hourlyData[hour] = (hourlyData[hour] || 0) + 1;
    }

    // Convert to array and sort
    return Object.entries(hourlyData)
      .map(([timestamp, count]) => ({ timestamp, count }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  // ==================== Helper Methods ====================

  /**
   * Create a limit breach event
   */
  async logLimitBreach(
    tenantId: string,
    limitType: string,
    currentValue: number,
    maxValue: number,
    strategyId?: string,
    assetId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'LIMIT_BREACH',
      severity: 'CRITICAL',
      strategyId,
      assetId,
      description: `Position limit breached: ${currentValue} exceeds ${maxValue}`,
      triggerCondition: `${limitType} limit: ${maxValue}`,
      actionTaken: 'Order rejected',
      metadata: { limitType, currentValue, maxValue }
    });
  },

  /**
   * Create a drawdown warning event
   */
  async logDrawdownWarning(
    tenantId: string,
    currentDrawdown: number,
    warningThreshold: number,
    strategyId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'DRAWDOWN_WARNING',
      severity: 'WARNING',
      strategyId,
      description: `Drawdown warning: ${currentDrawdown.toFixed(2)}% approaching threshold`,
      triggerCondition: `Warning threshold: ${warningThreshold}%`,
      actionTaken: 'Alert sent',
      metadata: { currentDrawdown, warningThreshold }
    });
  },

  /**
   * Create a drawdown breach event
   */
  async logDrawdownBreach(
    tenantId: string,
    currentDrawdown: number,
    maxThreshold: number,
    strategyId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'DRAWDOWN_BREACH',
      severity: 'CRITICAL',
      strategyId,
      description: `Drawdown breach: ${currentDrawdown.toFixed(2)}% exceeds maximum`,
      triggerCondition: `Max threshold: ${maxThreshold}%`,
      actionTaken: 'Trading paused',
      metadata: { currentDrawdown, maxThreshold }
    });
  },

  /**
   * Create a kill switch activation event
   */
  async logKillSwitchActivated(
    tenantId: string,
    reason: string,
    activatedBy: string,
    triggerType: 'MANUAL' | 'AUTOMATIC'
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'KILL_SWITCH_ACTIVATED',
      severity: 'EMERGENCY',
      description: `Kill switch activated: ${reason}`,
      triggerCondition: `Trigger type: ${triggerType}`,
      actionTaken: 'All trading halted, pending orders cancelled',
      metadata: { reason, activatedBy, triggerType }
    });
  },

  /**
   * Create a circuit breaker trip event
   */
  async logCircuitBreakerTrip(
    tenantId: string,
    breakerName: string,
    condition: string,
    strategyId?: string,
    assetId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'CIRCUIT_BREAKER_TRIP',
      severity: 'CRITICAL',
      strategyId,
      assetId,
      description: `Circuit breaker tripped: ${breakerName}`,
      triggerCondition: condition,
      actionTaken: 'Trading paused for affected scope',
      metadata: { breakerName, condition }
    });
  },

  /**
   * Create an order rejected event
   */
  async logOrderRejected(
    tenantId: string,
    orderId: string,
    reason: string,
    strategyId?: string,
    assetId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'ORDER_REJECTED',
      severity: 'WARNING',
      strategyId,
      assetId,
      description: `Order rejected: ${reason}`,
      triggerCondition: 'Pre-trade check failed',
      actionTaken: 'Order not submitted',
      metadata: { orderId, reason }
    });
  },

  /**
   * Create an exchange error event
   */
  async logExchangeError(
    tenantId: string,
    exchangeId: string,
    errorType: string,
    errorMessage: string,
    strategyId?: string
  ): Promise<RiskEvent> {
    return this.logEvent({
      tenantId,
      eventType: 'EXCHANGE_ERROR',
      severity: 'WARNING',
      strategyId,
      description: `Exchange error: ${errorMessage}`,
      triggerCondition: `Exchange: ${exchangeId}, Error type: ${errorType}`,
      actionTaken: 'Error logged, appropriate handling applied',
      metadata: { exchangeId, errorType, errorMessage }
    });
  },

  // ==================== Audit Operations ====================

  /**
   * Log an audited risk event with extended audit fields
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param input - The audited risk event input
   * @returns The created audited risk event
   */
  async logAuditedEvent(input: AuditedRiskEventInput): Promise<AuditedRiskEvent> {
    const eventId = generateUUID();
    const timestamp = new Date().toISOString();

    const event: AuditedRiskEvent = {
      eventId,
      tenantId: input.tenantId,
      eventType: input.eventType,
      severity: input.severity,
      strategyId: input.strategyId,
      assetId: input.assetId,
      description: input.description,
      triggerCondition: input.triggerCondition,
      actionTaken: input.actionTaken,
      metadata: input.metadata || {},
      timestamp,
      triggeringTradeId: input.triggeringTradeId,
      triggeringMarketConditions: input.triggeringMarketConditions,
      rejectionDetails: input.rejectionDetails,
      parameterChange: input.parameterChange
    };

    // Store the audited event
    await RiskEventRepository.putAuditedEvent(event);

    // Check if we need to send alerts
    await this.checkAndSendAlerts(event);

    return event;
  },

  /**
   * Log a rejection event with full details of failed checks
   * 
   * Requirements: 3.4
   * 
   * @param tenantId - The tenant identifier
   * @param orderId - The rejected order ID
   * @param orderSnapshot - The complete order state at rejection
   * @param failedChecks - Array of failed risk checks
   * @param strategyId - Optional strategy ID
   * @param assetId - Optional asset ID
   * @param triggeringTradeId - Optional triggering trade ID
   * @param marketConditions - Optional market conditions at time of rejection
   * @returns The created audited risk event
   */
  async logRejection(
    tenantId: string,
    orderId: string,
    orderSnapshot: OrderSnapshot,
    failedChecks: FailedCheck[],
    strategyId?: string,
    assetId?: string,
    triggeringTradeId?: string,
    marketConditions?: MarketConditionSnapshot
  ): Promise<AuditedRiskEvent> {
    const rejectionDetails: RejectionDetails = {
      orderId,
      failedChecks,
      orderSnapshot
    };

    const failedCheckDescriptions = failedChecks.map(c => c.checkType).join(', ');

    return this.logAuditedEvent({
      tenantId,
      eventType: 'ORDER_REJECTED',
      severity: 'WARNING',
      strategyId,
      assetId,
      description: `Order ${orderId} rejected: ${failedCheckDescriptions}`,
      triggerCondition: `Failed checks: ${failedChecks.length}`,
      actionTaken: 'Order not submitted',
      metadata: { orderId, failedCheckCount: failedChecks.length },
      rejectionDetails,
      triggeringTradeId,
      triggeringMarketConditions: marketConditions
    });
  },

  /**
   * Log a parameter change event with before/after values
   * 
   * Requirements: 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param parameterName - The name of the changed parameter
   * @param previousValue - The previous value
   * @param newValue - The new value
   * @param changedBy - The user who made the change
   * @param changeReason - Optional reason for the change
   * @param strategyId - Optional strategy ID
   * @returns The created audited risk event
   */
  async logParameterChange(
    tenantId: string,
    parameterName: string,
    previousValue: unknown,
    newValue: unknown,
    changedBy: string,
    changeReason?: string,
    strategyId?: string
  ): Promise<AuditedRiskEvent> {
    const parameterChange: ParameterChangeRecord = {
      parameterName,
      previousValue,
      newValue,
      changedBy,
      changeReason
    };

    return this.logAuditedEvent({
      tenantId,
      eventType: 'LIMIT_WARNING', // Using LIMIT_WARNING for parameter changes
      severity: 'INFO',
      strategyId,
      description: `Risk parameter '${parameterName}' changed from ${JSON.stringify(previousValue)} to ${JSON.stringify(newValue)}`,
      triggerCondition: `Parameter change by ${changedBy}`,
      actionTaken: 'Parameter updated',
      metadata: { parameterName, previousValue, newValue, changedBy, changeReason },
      parameterChange
    });
  },

  /**
   * Link a risk event to its triggering context
   * 
   * Requirements: 3.3
   * 
   * @param eventId - The event identifier
   * @param tradeId - Optional triggering trade ID
   * @param marketConditions - Optional market conditions snapshot
   */
  async linkToContext(
    eventId: string,
    tradeId?: string,
    marketConditions?: MarketConditionSnapshot
  ): Promise<void> {
    await RiskEventRepository.putContextLink(eventId, tradeId, marketConditions);
  },

  /**
   * Get an audited risk event by ID
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param timestamp - The event timestamp
   * @param eventId - The event identifier
   * @returns The audited risk event, or null if not found
   */
  async getAuditedEvent(tenantId: string, timestamp: string, eventId: string): Promise<AuditedRiskEvent | null> {
    return RiskEventRepository.getAuditedEvent(tenantId, timestamp, eventId);
  },

  /**
   * Get audited risk events for a tenant with optional filters
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param filters - Optional filters
   * @returns Array of audited risk events
   */
  async getAuditedEvents(tenantId: string, filters: RiskEventFilters): Promise<AuditedRiskEvent[]> {
    const result = await RiskEventRepository.listAuditedEvents(tenantId, filters);
    return result.items;
  },

  /**
   * Get risk events linked to a specific trade
   * 
   * Requirements: 3.3
   * 
   * @param tenantId - The tenant identifier
   * @param tradeId - The triggering trade ID
   * @returns Array of audited risk events linked to the trade
   */
  async getEventsByTradeId(tenantId: string, tradeId: string): Promise<AuditedRiskEvent[]> {
    return RiskEventRepository.getEventsByTradeId(tenantId, tradeId);
  },

  /**
   * Get parameter change history for a tenant
   * 
   * Requirements: 3.5
   * 
   * @param tenantId - The tenant identifier
   * @param parameterName - Optional filter by parameter name
   * @returns Array of parameter change records
   */
  async getParameterChangeHistory(tenantId: string, parameterName?: string): Promise<ParameterChangeRecord[]> {
    return RiskEventRepository.getParameterChanges(tenantId, parameterName);
  },

  /**
   * Serialize an audited risk event to JSON
   * 
   * Requirements: 3.2
   * 
   * @param event - The audited risk event
   * @returns JSON string
   */
  serializeAuditedEvent(event: AuditedRiskEvent): string {
    return JSON.stringify(event);
  },

  /**
   * Deserialize an audited risk event from JSON
   * 
   * Requirements: 3.2
   * 
   * @param json - The JSON string
   * @returns The audited risk event
   */
  deserializeAuditedEvent(json: string): AuditedRiskEvent {
    return JSON.parse(json) as AuditedRiskEvent;
  },

  /**
   * Validate that an audited event has all required fields
   * 
   * Requirements: 3.2
   * 
   * @param event - The audited risk event
   * @returns True if all required fields are present
   */
  validateAuditedEventFields(event: AuditedRiskEvent): boolean {
    // Check base required fields
    const hasBaseFields = !!(
      event.eventId &&
      event.tenantId &&
      event.eventType &&
      event.severity &&
      event.description &&
      event.triggerCondition &&
      event.actionTaken &&
      event.timestamp
    );

    // If it's a rejection event, check rejection details
    if (event.eventType === 'ORDER_REJECTED' && event.rejectionDetails) {
      const hasRejectionFields = !!(
        event.rejectionDetails.orderId &&
        event.rejectionDetails.failedChecks &&
        event.rejectionDetails.orderSnapshot
      );
      return hasBaseFields && hasRejectionFields;
    }

    return hasBaseFields;
  },

  /**
   * Validate that context links can be resolved
   * 
   * Requirements: 3.3
   * 
   * @param event - The audited risk event
   * @returns True if context links are valid (or not present)
   */
  validateContextLinks(event: AuditedRiskEvent): boolean {
    // If no context links, validation passes
    if (!event.triggeringTradeId && !event.triggeringMarketConditions) {
      return true;
    }

    // If trade ID is present, it should be a valid UUID format
    if (event.triggeringTradeId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(event.triggeringTradeId)) {
        return false;
      }
    }

    // If market conditions are present, they should have required fields
    if (event.triggeringMarketConditions) {
      const mc = event.triggeringMarketConditions;
      if (!mc.timestamp || !mc.prices || !mc.volatility || !mc.volume24h) {
        return false;
      }
    }

    return true;
  },

  /**
   * Validate parameter change record has all required fields
   * 
   * Requirements: 3.5
   * 
   * @param change - The parameter change record
   * @returns True if all required fields are present
   */
  validateParameterChange(change: ParameterChangeRecord): boolean {
    return !!(
      change.parameterName &&
      change.previousValue !== undefined &&
      change.newValue !== undefined &&
      change.changedBy
    );
  }
};
