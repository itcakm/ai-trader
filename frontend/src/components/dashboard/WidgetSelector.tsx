'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { WidgetType, DashboardWidget, WidgetConfig, WidgetPosition } from '@/types/dashboard';
import { WIDGET_SIZE_PRESETS } from '@/types/dashboard';

/**
 * Widget type metadata
 */
interface WidgetTypeInfo {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  category: 'metrics' | 'charts' | 'data' | 'activity';
}

/**
 * Available widget types
 */
const WIDGET_TYPES: WidgetTypeInfo[] = [
  {
    type: 'metric_card',
    name: 'Metric Card',
    description: 'Display a single metric with trend indicator',
    icon: '📊',
    category: 'metrics',
  },
  {
    type: 'line_chart',
    name: 'Line Chart',
    description: 'Show time series data as a line graph',
    icon: '📈',
    category: 'charts',
  },
  {
    type: 'bar_chart',
    name: 'Bar Chart',
    description: 'Display categorical data as bars',
    icon: '📊',
    category: 'charts',
  },
  {
    type: 'pie_chart',
    name: 'Pie Chart',
    description: 'Show proportional data as a pie/donut',
    icon: '🥧',
    category: 'charts',
  },
  {
    type: 'data_table',
    name: 'Data Table',
    description: 'Display tabular data with sorting',
    icon: '📋',
    category: 'data',
  },
  {
    type: 'alert_list',
    name: 'Alert List',
    description: 'Show system alerts by severity',
    icon: '🔔',
    category: 'activity',
  },
  {
    type: 'activity_feed',
    name: 'Activity Feed',
    description: 'Display recent system activities',
    icon: '📜',
    category: 'activity',
  },
  {
    type: 'heatmap',
    name: 'Heatmap',
    description: 'Visualize data density with colors',
    icon: '🗺️',
    category: 'charts',
  },
];

/**
 * Category labels
 */
const CATEGORY_LABELS: Record<string, string> = {
  metrics: 'Metrics',
  charts: 'Charts',
  data: 'Data',
  activity: 'Activity',
};

/**
 * Props for WidgetSelector component
 */
export interface WidgetSelectorProps {
  onSelect: (widget: Omit<DashboardWidget, 'id'>) => void;
  onCancel: () => void;
  existingWidgets?: DashboardWidget[];
  className?: string;
}

/**
 * WidgetSelector - Interface for selecting and configuring new widgets
 * 
 * Features:
 * - Widget type selection with categories
 * - Basic configuration options
 * - Preview of widget size
 * - Position calculation to avoid overlaps
 */
export function WidgetSelector({
  onSelect,
  onCancel,
  existingWidgets = [],
  className = '',
}: WidgetSelectorProps) {
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [title, setTitle] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Filter widgets by category
  const filteredWidgets = useMemo(() => {
    if (!categoryFilter) return WIDGET_TYPES;
    return WIDGET_TYPES.filter((w) => w.category === categoryFilter);
  }, [categoryFilter]);

  // Group widgets by category
  const groupedWidgets = useMemo(() => {
    const groups: Record<string, WidgetTypeInfo[]> = {};
    for (const widget of filteredWidgets) {
      if (!groups[widget.category]) {
        groups[widget.category] = [];
      }
      groups[widget.category].push(widget);
    }
    return groups;
  }, [filteredWidgets]);

  // Calculate next available position
  const calculatePosition = (type: WidgetType): WidgetPosition => {
    const preset = WIDGET_SIZE_PRESETS[type];
    
    if (existingWidgets.length === 0) {
      return preset;
    }

    // Find the lowest available Y position
    const maxY = Math.max(...existingWidgets.map((w) => w.position.y + w.position.h));
    
    // Try to fit in existing rows first
    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= 12 - preset.w; x++) {
        const testPos = { ...preset, x, y };
        const hasOverlap = existingWidgets.some((w) => {
          return !(
            testPos.x + testPos.w <= w.position.x ||
            w.position.x + w.position.w <= testPos.x ||
            testPos.y + testPos.h <= w.position.y ||
            w.position.y + w.position.h <= testPos.y
          );
        });
        if (!hasOverlap) {
          return testPos;
        }
      }
    }

    // Place at the bottom
    return { ...preset, x: 0, y: maxY };
  };

  // Handle widget selection
  const handleSelect = () => {
    if (!selectedType) return;

    const position = calculatePosition(selectedType);
    const config: WidgetConfig = {
      title: title || WIDGET_TYPES.find((w) => w.type === selectedType)?.name,
      showHeader: true,
    };

    if (dataSource) {
      (config as { dataSource?: string }).dataSource = dataSource;
    }

    onSelect({
      type: selectedType,
      title: title || WIDGET_TYPES.find((w) => w.type === selectedType)?.name || 'Widget',
      config,
      position,
    });
  };

  const selectedWidgetInfo = WIDGET_TYPES.find((w) => w.type === selectedType);

  return (
    <Card className={`w-full max-w-2xl ${className}`}>
      <CardHeader>
        <CardTitle>Add Widget</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Category filter */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={categoryFilter === null ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setCategoryFilter(null)}
          >
            All
          </Button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <Button
              key={key}
              variant={categoryFilter === key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setCategoryFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Widget type selection */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Object.entries(groupedWidgets).map(([category, widgets]) => (
            <React.Fragment key={category}>
              {!categoryFilter && (
                <div className="col-span-full text-sm font-medium text-muted-foreground mt-2 first:mt-0">
                  {CATEGORY_LABELS[category]}
                </div>
              )}
              {widgets.map((widget) => (
                <button
                  key={widget.type}
                  onClick={() => setSelectedType(widget.type)}
                  className={`
                    p-3 rounded-lg border text-left transition-all
                    ${selectedType === widget.type
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div className="text-2xl mb-1">{widget.icon}</div>
                  <div className="text-sm font-medium">{widget.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {widget.description}
                  </div>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Configuration */}
        {selectedType && (
          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Widget Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedWidgetInfo?.name}
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Data Source
              </label>
              <input
                type="text"
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                placeholder="e.g., /api/metrics/portfolio"
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
              />
            </div>

            {/* Size preview */}
            <div className="text-sm text-muted-foreground">
              Size: {WIDGET_SIZE_PRESETS[selectedType].w} × {WIDGET_SIZE_PRESETS[selectedType].h} cells
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSelect}
            disabled={!selectedType}
          >
            Add Widget
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default WidgetSelector;
