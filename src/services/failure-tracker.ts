/**
 * Validation Failure Tracker Service
 * Tracks consecutive validation failures per model and triggers alerts at threshold.
 * Requirements: 9.4
 */

export interface ValidationFailureRecord {
  modelConfigId: string;
  consecutiveFailures: number;
  lastFailureAt: string;
  lastFailureReason?: string;
  alertTriggered: boolean;
}

export interface AlertCallback {
  (modelConfigId: string, consecutiveFailures: number, lastFailureReason?: string): void;
}

export interface FailureTrackerConfig {
  alertThreshold: number;
  onAlert?: AlertCallback;
}

const DEFAULT_ALERT_THRESHOLD = 5;

export class ValidationFailureTracker {
  private failures: Map<string, ValidationFailureRecord>;
  private alertThreshold: number;
  private onAlert?: AlertCallback;

  constructor(config?: FailureTrackerConfig) {
    this.failures = new Map();
    this.alertThreshold = config?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
    this.onAlert = config?.onAlert;
  }

  /**
   * Records a validation failure for a model.
   * Increments consecutive failure count and triggers alert if threshold exceeded.
   */
  recordFailure(modelConfigId: string, reason?: string): ValidationFailureRecord {
    const existing = this.failures.get(modelConfigId);
    const now = new Date().toISOString();

    const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
    const shouldAlert = consecutiveFailures >= this.alertThreshold && !existing?.alertTriggered;

    const record: ValidationFailureRecord = {
      modelConfigId,
      consecutiveFailures,
      lastFailureAt: now,
      lastFailureReason: reason,
      alertTriggered: existing?.alertTriggered || shouldAlert
    };

    this.failures.set(modelConfigId, record);

    // Trigger alert if threshold reached for the first time
    if (shouldAlert && this.onAlert) {
      this.onAlert(modelConfigId, consecutiveFailures, reason);
    }

    return record;
  }

  /**
   * Records a successful validation, resetting the failure count for a model.
   */
  recordSuccess(modelConfigId: string): void {
    this.failures.delete(modelConfigId);
  }

  /**
   * Gets the current failure record for a model.
   */
  getFailureRecord(modelConfigId: string): ValidationFailureRecord | undefined {
    return this.failures.get(modelConfigId);
  }

  /**
   * Gets the consecutive failure count for a model.
   */
  getConsecutiveFailures(modelConfigId: string): number {
    return this.failures.get(modelConfigId)?.consecutiveFailures ?? 0;
  }

  /**
   * Checks if an alert has been triggered for a model.
   */
  hasAlertTriggered(modelConfigId: string): boolean {
    return this.failures.get(modelConfigId)?.alertTriggered ?? false;
  }

  /**
   * Checks if a model has exceeded the alert threshold.
   */
  isAboveThreshold(modelConfigId: string): boolean {
    return this.getConsecutiveFailures(modelConfigId) >= this.alertThreshold;
  }

  /**
   * Gets the configured alert threshold.
   */
  getAlertThreshold(): number {
    return this.alertThreshold;
  }

  /**
   * Sets a new alert threshold.
   */
  setAlertThreshold(threshold: number): void {
    if (threshold < 1) {
      throw new Error('Alert threshold must be at least 1');
    }
    this.alertThreshold = threshold;
  }

  /**
   * Sets the alert callback.
   */
  setAlertCallback(callback: AlertCallback): void {
    this.onAlert = callback;
  }

  /**
   * Resets the failure record for a model.
   */
  reset(modelConfigId: string): void {
    this.failures.delete(modelConfigId);
  }

  /**
   * Resets all failure records.
   */
  resetAll(): void {
    this.failures.clear();
  }

  /**
   * Gets all models that have exceeded the alert threshold.
   */
  getModelsAboveThreshold(): string[] {
    const result: string[] = [];
    this.failures.forEach((record, modelConfigId) => {
      if (record.consecutiveFailures >= this.alertThreshold) {
        result.push(modelConfigId);
      }
    });
    return result;
  }

  /**
   * Gets all failure records.
   */
  getAllFailureRecords(): ValidationFailureRecord[] {
    return Array.from(this.failures.values());
  }
}

// Singleton instance for convenience
export const validationFailureTracker = new ValidationFailureTracker();
