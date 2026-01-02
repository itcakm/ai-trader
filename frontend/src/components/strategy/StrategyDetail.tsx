'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Strategy, StrategyVersion, strategyStateVariant } from '../../types/strategy';

export interface StrategyDetailProps {
  strategy: Strategy;
  versions?: StrategyVersion[];
  loading?: boolean;
  onEdit?: () => void;
  onDeploy?: () => void;
  onBack?: () => void;
  onVersionSelect?: (version: StrategyVersion) => void;
}

export function StrategyDetail({
  strategy,
  versions = [],
  loading = false,
  onEdit,
  onDeploy,
  onBack,
  onVersionSelect,
}: StrategyDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'parameters' | 'history'>('overview');

  const canDeploy = strategy.state === 'DRAFT' || strategy.state === 'STOPPED';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← Back
            </Button>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{strategy.name}</h1>
              <Badge variant={strategyStateVariant[strategy.state]}>{strategy.state}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Version {strategy.currentVersion} • Last updated {formatDate(strategy.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              Edit
            </Button>
          )}
          {onDeploy && canDeploy && (
            <Button onClick={onDeploy}>Deploy</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {(['overview', 'parameters', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }
              `}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab strategy={strategy} formatDate={formatDate} />
          )}
          {activeTab === 'parameters' && (
            <ParametersTab strategy={strategy} />
          )}
          {activeTab === 'history' && (
            <HistoryTab
              versions={versions}
              currentVersion={strategy.currentVersion}
              onVersionSelect={onVersionSelect}
              formatDate={formatDate}
            />
          )}
        </>
      )}
    </div>
  );
}


interface OverviewTabProps {
  strategy: Strategy;
  formatDate: (dateString: string) => string;
}

function OverviewTab({ strategy, formatDate }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Strategy Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow label="Strategy ID" value={strategy.strategyId} />
          <InfoRow label="Template ID" value={strategy.templateId} />
          <InfoRow label="Template Version" value={strategy.templateVersion.toString()} />
          <InfoRow label="Current Version" value={strategy.currentVersion.toString()} />
          <InfoRow label="Created" value={formatDate(strategy.createdAt)} />
          <InfoRow label="Last Updated" value={formatDate(strategy.updatedAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-3 h-3 rounded-full ${
                strategy.state === 'ACTIVE'
                  ? 'bg-green-500 animate-pulse'
                  : strategy.state === 'ERROR'
                  ? 'bg-red-500'
                  : 'bg-gray-400'
              }`}
            />
            <span className="font-medium">{strategy.state}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {strategy.state === 'DRAFT' && 'This strategy is in draft mode and has not been deployed.'}
            {strategy.state === 'ACTIVE' && 'This strategy is actively trading.'}
            {strategy.state === 'PAUSED' && 'This strategy is paused and not executing trades.'}
            {strategy.state === 'STOPPED' && 'This strategy has been stopped.'}
            {strategy.state === 'ERROR' && 'This strategy encountered an error and requires attention.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface ParametersTabProps {
  strategy: Strategy;
}

function ParametersTab({ strategy }: ParametersTabProps) {
  const parameters = Object.entries(strategy.parameters);

  if (parameters.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No parameters configured for this strategy.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Parameters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parameters.map(([key, value]) => (
            <div key={key} className="p-4 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{key}</p>
              <p className="font-medium text-foreground">
                {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : String(value)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface HistoryTabProps {
  versions: StrategyVersion[];
  currentVersion: number;
  onVersionSelect?: (version: StrategyVersion) => void;
  formatDate: (dateString: string) => string;
}

function HistoryTab({ versions, currentVersion, onVersionSelect, formatDate }: HistoryTabProps) {
  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No version history available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {versions.map((version) => (
            <div
              key={version.version}
              className={`
                p-4 border rounded-lg cursor-pointer transition-colors
                ${version.version === currentVersion
                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-border hover:bg-muted'
                }
              `}
              onClick={() => onVersionSelect?.(version)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Version {version.version}</span>
                  {version.version === currentVersion && (
                    <Badge variant="info">Current</Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDate(version.createdAt)}
                </span>
              </div>
              {version.changeDescription && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {version.changeDescription}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                By {version.createdBy}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
