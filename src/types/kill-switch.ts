/**
 * Kill Switch Types
 * Requirements: 4.1, 4.3
 */

export type KillTriggerType = 'MANUAL' | 'AUTOMATIC';
export type KillSwitchScopeType = 'TENANT' | 'STRATEGY' | 'ASSET';

export interface KillSwitchState {
  tenantId: string;
  active: boolean;
  activatedAt?: string;
  activatedBy?: string;
  activationReason?: string;
  triggerType: KillTriggerType;
  scope: KillSwitchScopeType;
  scopeId?: string;
  pendingOrdersCancelled: number;
}

export interface KillSwitchScope {
  type: KillSwitchScopeType;
  id?: string;
}

export type KillTriggerCondition =
  | { type: 'RAPID_LOSS'; lossPercent: number; timeWindowMinutes: number }
  | { type: 'ERROR_RATE'; errorPercent: number; timeWindowMinutes: number }
  | { type: 'SYSTEM_ERROR'; errorTypes: string[] };

export interface AutoKillTrigger {
  triggerId: string;
  condition: KillTriggerCondition;
  enabled: boolean;
}

export interface KillSwitchConfig {
  configId: string;
  tenantId: string;
  autoTriggers: AutoKillTrigger[];
  requireAuthForDeactivation: boolean;
  notificationChannels: string[];
}

export interface KillSwitchService {
  activate(tenantId: string, reason: string, scope?: KillSwitchScope): Promise<KillSwitchState>;
  deactivate(tenantId: string, authToken: string): Promise<KillSwitchState>;
  getState(tenantId: string): Promise<KillSwitchState>;
  checkAutoTriggers(tenantId: string, event: unknown): Promise<boolean>;
  isActive(tenantId: string): Promise<boolean>;
}
