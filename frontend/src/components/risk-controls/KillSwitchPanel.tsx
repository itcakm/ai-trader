'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  KillSwitchState,
  KillSwitchConfig,
  AutoKillTrigger,
  KillSwitchScopeType,
} from '../../types/risk-controls';

export interface KillSwitchPanelProps {
  state: KillSwitchState;
  config: KillSwitchConfig;
  loading?: boolean;
  onActivate?: (reason: string, scope?: { type: KillSwitchScopeType; id?: string }) => void;
  onDeactivate?: () => void;
  onUpdateConfig?: (config: Partial<KillSwitchConfig>) => void;
  onToggleTrigger?: (triggerId: string, enabled: boolean) => void;
}

export function KillSwitchPanel({
  state,
  config,
  loading = false,
  onActivate,
  onDeactivate,
  onUpdateConfig,
  onToggleTrigger,
}: KillSwitchPanelProps) {
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Kill Switch Status */}
      <Card className={state.active ? 'border-red-500' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Kill Switch</CardTitle>
            <Badge variant={state.active ? 'error' : 'success'} className="text-base px-3 py-1">
              {state.active ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {state.active ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200 font-medium mb-2">
                  ⚠️ Trading is currently halted
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-red-600 dark:text-red-400">Activated At</p>
                    <p className="font-medium text-red-800 dark:text-red-200">
                      {formatTime(state.activatedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-red-600 dark:text-red-400">Activated By</p>
                    <p className="font-medium text-red-800 dark:text-red-200">
                      {state.activatedBy || 'System'}
                    </p>
                  </div>
                  <div>
                    <p className="text-red-600 dark:text-red-400">Trigger Type</p>
                    <p className="font-medium text-red-800 dark:text-red-200">{state.triggerType}</p>
                  </div>
                  <div>
                    <p className="text-red-600 dark:text-red-400">Scope</p>
                    <p className="font-medium text-red-800 dark:text-red-200">
                      {state.scope} {state.scopeId ? `(${state.scopeId})` : ''}
                    </p>
                  </div>
                </div>
                {state.activationReason && (
                  <div className="mt-4">
                    <p className="text-red-600 dark:text-red-400 text-sm">Reason</p>
                    <p className="text-red-800 dark:text-red-200">{state.activationReason}</p>
                  </div>
                )}
                <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                  {state.pendingOrdersCancelled} pending orders were cancelled
                </p>
              </div>

              {onDeactivate && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowDeactivateModal(true)}
                >
                  Deactivate Kill Switch
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                The kill switch is inactive. Trading operations are proceeding normally.
              </p>
              {onActivate && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowActivateModal(true)}
                >
                  Activate Kill Switch
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Automatic Triggers</CardTitle>
        </CardHeader>
        <CardContent>
          {config.autoTriggers.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">
              No automatic triggers configured.
            </p>
          ) : (
            <div className="space-y-3">
              {config.autoTriggers.map((trigger) => (
                <TriggerRow
                  key={trigger.triggerId}
                  trigger={trigger}
                  onToggle={onToggleTrigger}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Require Auth for Deactivation</p>
              <p className="text-sm text-muted-foreground">
                Require re-authentication to deactivate the kill switch
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.requireAuthForDeactivation}
                onChange={(e) =>
                  onUpdateConfig?.({ requireAuthForDeactivation: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div>
            <p className="font-medium text-foreground mb-2">Notification Channels</p>
            <div className="flex flex-wrap gap-2">
              {config.notificationChannels.map((channel) => (
                <Badge key={channel} variant="default">{channel}</Badge>
              ))}
              {config.notificationChannels.length === 0 && (
                <p className="text-sm text-muted-foreground">No notification channels configured</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activate Modal */}
      {showActivateModal && (
        <ActivateModal
          onActivate={(reason, scope) => {
            onActivate?.(reason, scope);
            setShowActivateModal(false);
          }}
          onCancel={() => setShowActivateModal(false)}
          loading={loading}
        />
      )}

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <DeactivateModal
          requireAuth={config.requireAuthForDeactivation}
          onDeactivate={() => {
            onDeactivate?.();
            setShowDeactivateModal(false);
          }}
          onCancel={() => setShowDeactivateModal(false)}
          loading={loading}
        />
      )}
    </div>
  );
}

interface TriggerRowProps {
  trigger: AutoKillTrigger;
  onToggle?: (triggerId: string, enabled: boolean) => void;
}

function TriggerRow({ trigger, onToggle }: TriggerRowProps) {
  const getConditionDescription = () => {
    switch (trigger.condition.type) {
      case 'RAPID_LOSS':
        return `Loss exceeds ${trigger.condition.lossPercent}% in ${trigger.condition.timeWindowMinutes} minutes`;
      case 'ERROR_RATE':
        return `Error rate exceeds ${trigger.condition.errorPercent}% in ${trigger.condition.timeWindowMinutes} minutes`;
      case 'SYSTEM_ERROR':
        return `System errors: ${trigger.condition.errorTypes.join(', ')}`;
      default:
        return 'Unknown condition';
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg">
      <div>
        <p className="font-medium text-foreground">{trigger.condition.type.replace(/_/g, ' ')}</p>
        <p className="text-sm text-muted-foreground">{getConditionDescription()}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={trigger.enabled}
          onChange={(e) => onToggle?.(trigger.triggerId, e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
      </label>
    </div>
  );
}

interface ActivateModalProps {
  onActivate: (reason: string, scope?: { type: KillSwitchScopeType; id?: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

function ActivateModal({ onActivate, onCancel, loading }: ActivateModalProps) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<KillSwitchScopeType>('TENANT');
  const [scopeId, setScopeId] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim() && confirmed) {
      onActivate(reason, scope !== 'TENANT' ? { type: scope, id: scopeId } : undefined);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="text-red-600">Activate Kill Switch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">
                ⚠️ This will immediately halt all trading operations and cancel pending orders.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Scope</label>
              <Select
                options={[
                  { value: 'TENANT', label: 'All Trading (Tenant-wide)' },
                  { value: 'STRATEGY', label: 'Specific Strategy' },
                  { value: 'ASSET', label: 'Specific Asset' },
                ]}
                value={scope}
                onChange={(e) => setScope(e.target.value as KillSwitchScopeType)}
              />
            </div>

            {scope !== 'TENANT' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {scope === 'STRATEGY' ? 'Strategy ID' : 'Asset ID'}
                </label>
                <Input
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder={scope === 'STRATEGY' ? 'Enter strategy ID' : 'Enter asset ID'}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Reason</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for activation"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-red-400 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-foreground">
                I understand this will halt all trading
              </span>
            </label>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={loading}
              disabled={!reason.trim() || !confirmed}
            >
              Activate Kill Switch
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

interface DeactivateModalProps {
  requireAuth: boolean;
  onDeactivate: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function DeactivateModal({ requireAuth, onDeactivate, onCancel, loading }: DeactivateModalProps) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmed && (!requireAuth || password.trim())) {
      onDeactivate();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Deactivate Kill Switch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This will resume trading operations. Ensure all issues have been resolved before proceeding.
            </p>

            {requireAuth && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-foreground">
                I confirm all issues have been resolved
              </span>
            </label>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={!confirmed || (requireAuth && !password.trim())}
            >
              Deactivate
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
