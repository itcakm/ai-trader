'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import {
  DataQualityScore,
  DataAnomaly,
  DataSource,
  anomalySeverityVariant,
} from '../../types/market-data';

export interface QualityMonitoringDashboardProps {
  qualityScores: DataQualityScore[];
  sources: DataSource[];
  loading?: boolean;
  onRefresh?: () => void;
  onViewAnomalyDetails?: (anomaly: DataAnomaly) => void;
}

export function QualityMonitoringDashboard({
  qualityScores,
  sources,
  loading = false,
  onRefresh,
  onViewAnomalyDetails,
}: QualityMonitoringDashboardProps) {
  const [selectedSource, setSelectedSource] = useState('');
  const [timeRange, setTimeRange] = useState('24h');

  const sourceOptions = [
    { value: '', label: 'All Sources' },
    ...sources.map((s) => ({ value: s.sourceId, label: s.name })),
  ];

  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
  ];

  const filteredScores = selectedSource
    ? qualityScores.filter((s) => s.sourceId === selectedSource)
    : qualityScores;

  const averageScore =
    filteredScores.length > 0
      ? filteredScores.reduce((sum, s) => sum + s.overallScore, 0) / filteredScores.length
      : 0;

  const totalAnomalies = filteredScores.reduce((sum, s) => sum + s.anomalies.length, 0);

  const recentAnomalies = filteredScores
    .flatMap((s) => s.anomalies)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, 10);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Data Quality Monitoring</h2>
        <div className="flex items-center gap-4">
          <Select
            options={sourceOptions}
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
          />
          <Select
            options={timeRangeOptions}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          />
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Average Quality Score"
          value={`${averageScore.toFixed(1)}%`}
          valueColor={getScoreColor(averageScore)}
          loading={loading}
        />
        <SummaryCard
          title="Active Sources"
          value={sources.filter((s) => s.status === 'ACTIVE').length.toString()}
          loading={loading}
        />
        <SummaryCard
          title="Total Anomalies"
          value={totalAnomalies.toString()}
          valueColor={totalAnomalies > 0 ? 'text-yellow-600 dark:text-yellow-400' : undefined}
          loading={loading}
        />
        <SummaryCard
          title="Data Points Analyzed"
          value={filteredScores.length.toString()}
          loading={loading}
        />
      </div>

      {/* Quality Scores by Source */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Scores by Source</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : filteredScores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No quality data available for the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredScores.map((score) => (
                <QualityScoreRow
                  key={score.scoreId}
                  score={score}
                  sourceName={sources.find((s) => s.sourceId === score.sourceId)?.name || score.sourceId}
                  getScoreColor={getScoreColor}
                  getScoreBgColor={getScoreBgColor}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Anomalies */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Anomalies</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAnomalies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No anomalies detected in the selected time range.
            </div>
          ) : (
            <div className="space-y-3">
              {recentAnomalies.map((anomaly) => (
                <AnomalyRow
                  key={anomaly.anomalyId}
                  anomaly={anomaly}
                  onViewDetails={onViewAnomalyDetails}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


interface SummaryCardProps {
  title: string;
  value: string;
  valueColor?: string;
  loading?: boolean;
}

function SummaryCard({ title, value, valueColor, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        {loading ? (
          <div className="h-7 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <p className={`text-2xl font-semibold ${valueColor || 'text-foreground'}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface QualityScoreRowProps {
  score: DataQualityScore;
  sourceName: string;
  getScoreColor: (score: number) => string;
  getScoreBgColor: (score: number) => string;
}

function QualityScoreRow({ score, sourceName, getScoreColor, getScoreBgColor }: QualityScoreRowProps) {
  return (
    <div className="p-4 border border-border rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium text-foreground">{sourceName}</h4>
          <p className="text-sm text-muted-foreground">{score.symbol} • {score.dataType}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-semibold ${getScoreColor(score.overallScore)}`}>
            {score.overallScore.toFixed(1)}%
          </p>
          {score.anomalies.length > 0 && (
            <Badge variant="warning">{score.anomalies.length} anomalies</Badge>
          )}
        </div>
      </div>

      {/* Component Scores */}
      <div className="grid grid-cols-4 gap-4">
        <ComponentScore label="Completeness" value={score.components.completeness} getScoreBgColor={getScoreBgColor} />
        <ComponentScore label="Freshness" value={score.components.freshness} getScoreBgColor={getScoreBgColor} />
        <ComponentScore label="Consistency" value={score.components.consistency} getScoreBgColor={getScoreBgColor} />
        <ComponentScore label="Accuracy" value={score.components.accuracy} getScoreBgColor={getScoreBgColor} />
      </div>
    </div>
  );
}

interface ComponentScoreProps {
  label: string;
  value: number;
  getScoreBgColor: (score: number) => string;
}

function ComponentScore({ label, value, getScoreBgColor }: ComponentScoreProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getScoreBgColor(value)} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

interface AnomalyRowProps {
  anomaly: DataAnomaly;
  onViewDetails?: (anomaly: DataAnomaly) => void;
}

function AnomalyRow({ anomaly, onViewDetails }: AnomalyRowProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onViewDetails?.(anomaly)}
    >
      <div className="flex items-center gap-3">
        <Badge variant={anomalySeverityVariant[anomaly.severity]}>{anomaly.severity}</Badge>
        <div>
          <p className="font-medium text-foreground">{anomaly.type.replace(/_/g, ' ')}</p>
          <p className="text-sm text-muted-foreground">{anomaly.description}</p>
        </div>
      </div>
      <span className="text-sm text-muted-foreground">{formatTime(anomaly.detectedAt)}</span>
    </div>
  );
}
