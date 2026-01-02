'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { DashboardWidget, WidgetType, WidgetConfig, MetricCardConfig, ChartConfig, DataTableConfig, AlertListConfig, ActivityFeedConfig } from '@/types/dashboard';

/**
 * Props for WidgetConfigPanel component
 */
export interface WidgetConfigPanelProps {
  widget: DashboardWidget;
  onSave: (updates: Partial<DashboardWidget>) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * WidgetConfigPanel - Configuration panel for individual widgets
 * 
 * Features:
 * - Widget-specific configuration options
 * - Title editing
 * - Data source configuration
 * - Display options
 */
export function WidgetConfigPanel({
  widget,
  onSave,
  onCancel,
  className = '',
}: WidgetConfigPanelProps) {
  const [title, setTitle] = useState(widget.title);
  const [config, setConfig] = useState<WidgetConfig>(widget.config);
  const [drillDownPath, setDrillDownPath] = useState(widget.drillDownPath || '');

  // Update local state when widget changes
  useEffect(() => {
    setTitle(widget.title);
    setConfig(widget.config);
    setDrillDownPath(widget.drillDownPath || '');
  }, [widget]);

  // Update config field
  const updateConfig = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Handle save
  const handleSave = () => {
    onSave({
      title,
      config,
      drillDownPath: drillDownPath || undefined,
    });
  };

  // Render widget-specific options
  const renderWidgetOptions = () => {
    switch (widget.type) {
      case 'metric_card':
        return renderMetricCardOptions();
      case 'line_chart':
      case 'bar_chart':
      case 'pie_chart':
        return renderChartOptions();
      case 'data_table':
        return renderDataTableOptions();
      case 'alert_list':
        return renderAlertListOptions();
      case 'activity_feed':
        return renderActivityFeedOptions();
      default:
        return null;
    }
  };

  const renderMetricCardOptions = () => {
    const metricConfig = config as MetricCardConfig;
    return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Metric</label>
          <input
            type="text"
            value={metricConfig.metric || ''}
            onChange={(e) => updateConfig('metric' as keyof WidgetConfig, e.target.value as never)}
            placeholder="e.g., portfolio_value"
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Format</label>
          <select
            value={metricConfig.format || 'number'}
            onChange={(e) => updateConfig('format' as keyof WidgetConfig, e.target.value as never)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percentage">Percentage</option>
          </select>
        </div>
        {metricConfig.format === 'currency' && (
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <input
              type="text"
              value={metricConfig.currency || 'USD'}
              onChange={(e) => updateConfig('currency' as keyof WidgetConfig, e.target.value as never)}
              placeholder="USD"
              className="w-full px-3 py-2 rounded-md border border-border bg-background"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showTrend"
            checked={metricConfig.showTrend || false}
            onChange={(e) => updateConfig('showTrend' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="showTrend" className="text-sm">Show trend indicator</label>
        </div>
      </>
    );
  };

  const renderChartOptions = () => {
    const chartConfig = config as ChartConfig;
    return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Data Source</label>
          <input
            type="text"
            value={chartConfig.dataSource || ''}
            onChange={(e) => updateConfig('dataSource' as keyof WidgetConfig, e.target.value as never)}
            placeholder="e.g., /api/charts/performance"
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showLegend"
            checked={chartConfig.showLegend !== false}
            onChange={(e) => updateConfig('showLegend' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="showLegend" className="text-sm">Show legend</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showGrid"
            checked={chartConfig.showGrid !== false}
            onChange={(e) => updateConfig('showGrid' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="showGrid" className="text-sm">Show grid lines</label>
        </div>
      </>
    );
  };

  const renderDataTableOptions = () => {
    const tableConfig = config as DataTableConfig;
    return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Data Source</label>
          <input
            type="text"
            value={tableConfig.dataSource || ''}
            onChange={(e) => updateConfig('dataSource' as keyof WidgetConfig, e.target.value as never)}
            placeholder="e.g., /api/orders"
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Page Size</label>
          <input
            type="number"
            value={tableConfig.pageSize || 10}
            onChange={(e) => updateConfig('pageSize' as keyof WidgetConfig, parseInt(e.target.value) as never)}
            min={5}
            max={100}
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="sortable"
            checked={tableConfig.sortable !== false}
            onChange={(e) => updateConfig('sortable' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="sortable" className="text-sm">Enable sorting</label>
        </div>
      </>
    );
  };

  const renderAlertListOptions = () => {
    const alertConfig = config as AlertListConfig;
    return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Max Items</label>
          <input
            type="number"
            value={alertConfig.maxItems || 10}
            onChange={(e) => updateConfig('maxItems' as keyof WidgetConfig, parseInt(e.target.value) as never)}
            min={1}
            max={50}
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showAcknowledged"
            checked={alertConfig.showAcknowledged || false}
            onChange={(e) => updateConfig('showAcknowledged' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="showAcknowledged" className="text-sm">Show acknowledged alerts</label>
        </div>
      </>
    );
  };

  const renderActivityFeedOptions = () => {
    const feedConfig = config as ActivityFeedConfig;
    return (
      <>
        <div>
          <label className="block text-sm font-medium mb-1">Max Items</label>
          <input
            type="number"
            value={feedConfig.maxItems || 20}
            onChange={(e) => updateConfig('maxItems' as keyof WidgetConfig, parseInt(e.target.value) as never)}
            min={1}
            max={100}
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showTimestamps"
            checked={feedConfig.showTimestamps !== false}
            onChange={(e) => updateConfig('showTimestamps' as keyof WidgetConfig, e.target.checked as never)}
            className="rounded border-border"
          />
          <label htmlFor="showTimestamps" className="text-sm">Show timestamps</label>
        </div>
      </>
    );
  };

  return (
    <Card className={`w-full max-w-md ${className}`}>
      <CardHeader>
        <CardTitle>Configure Widget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Common options */}
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Drill-down Path</label>
          <input
            type="text"
            value={drillDownPath}
            onChange={(e) => setDrillDownPath(e.target.value)}
            placeholder="e.g., /reports/details"
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
          />
          <p className="text-xs text-muted-foreground mt-1">
            URL to navigate when clicking "View Details"
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showHeader"
            checked={config.showHeader !== false}
            onChange={(e) => updateConfig('showHeader', e.target.checked)}
            className="rounded border-border"
          />
          <label htmlFor="showHeader" className="text-sm">Show header</label>
        </div>

        {/* Widget-specific options */}
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium mb-3">Widget Options</h4>
          {renderWidgetOptions()}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

export default WidgetConfigPanel;
