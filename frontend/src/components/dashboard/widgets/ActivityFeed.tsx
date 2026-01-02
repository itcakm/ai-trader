'use client';

import React, { useMemo } from 'react';
import { WidgetWrapper } from './WidgetWrapper';
import type { ActivityData, ActivityFeedConfig } from '@/types/dashboard';

/**
 * Props for ActivityFeed component
 */
export interface ActivityFeedProps {
  title: string;
  activities: ActivityData[];
  config?: ActivityFeedConfig;
  onDrillDown?: () => void;
  onActivityClick?: (activity: ActivityData) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Get activity type icon
 */
function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    order: '📋',
    trade: '💱',
    strategy: '📊',
    risk: '⚠️',
    user: '👤',
    system: '⚙️',
    alert: '🔔',
    login: '🔐',
    logout: '🚪',
    config: '🔧',
    default: '📌',
  };
  return icons[type] || icons.default;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string, showTimestamps: boolean): string {
  if (!showTimestamps) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

/**
 * ActivityFeed - Displays a chronological list of system activities
 * 
 * Features:
 * - Activity type icons
 * - Filtering by activity type
 * - Time-based formatting
 * - Click handling for details
 * - Drill-down navigation
 */
export function ActivityFeed({
  title,
  activities,
  config = {},
  onDrillDown,
  onActivityClick,
  isLoading = false,
  error = null,
  className = '',
}: ActivityFeedProps) {
  const showTimestamps = config.showTimestamps !== false;

  // Filter activities based on config
  const filteredActivities = useMemo(() => {
    let result = activities;

    // Filter by activity types
    if (config.activityTypes && config.activityTypes.length > 0) {
      result = result.filter((a) => config.activityTypes!.includes(a.type));
    }

    // Limit items
    if (config.maxItems && config.maxItems > 0) {
      result = result.slice(0, config.maxItems);
    }

    return result;
  }, [activities, config.activityTypes, config.maxItems]);

  return (
    <WidgetWrapper
      title={title}
      showHeader={config.showHeader !== false}
      onDrillDown={onDrillDown}
      isLoading={isLoading}
      error={error}
      className={className}
    >
      <div className="flex flex-col h-full overflow-auto">
        {filteredActivities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No recent activity
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            {filteredActivities.map((activity, index) => (
              <div
                key={activity.id}
                className={`
                  relative pl-10 pr-2 py-3
                  ${index !== filteredActivities.length - 1 ? 'border-b border-border/50' : ''}
                  ${onActivityClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                `}
                onClick={() => onActivityClick?.(activity)}
              >
                {/* Timeline dot */}
                <div className="absolute left-2 top-4 w-4 h-4 rounded-full bg-background border-2 border-primary flex items-center justify-center text-xs">
                  {getActivityIcon(activity.type)}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {activity.actor}
                    </span>
                    {showTimestamps && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatTimestamp(activity.timestamp, showTimestamps)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground">{activity.action}</span>
                    {activity.target && (
                      <>
                        {' '}
                        <span className="font-medium text-primary">
                          {activity.target}
                        </span>
                      </>
                    )}
                  </div>
                  {activity.details && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {activity.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default ActivityFeed;
