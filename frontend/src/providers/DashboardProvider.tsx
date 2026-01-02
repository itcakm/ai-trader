'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import type {
  Dashboard,
  DashboardWidget,
  DashboardContextValue,
  DashboardSubscription,
  WidgetPosition,
  GridLayout,
  DashboardType,
} from '@/types/dashboard';
import { DEFAULT_GRID_LAYOUT, DEFAULT_REFRESH_INTERVAL } from '@/types/dashboard';

// Context
const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

/**
 * Generate unique ID
 */
function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Mock API for dashboard operations
 * In production, this would call actual API endpoints
 */
const dashboardApi = {
  async load(id: string): Promise<Dashboard | null> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Return null for now - in production would fetch from backend
    return null;
  },

  async save(dashboard: Dashboard): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: await fetch('/api/dashboards', { method: 'PUT', body: JSON.stringify(dashboard) });
  },

  async create(dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<Dashboard> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now = new Date().toISOString();
    return {
      ...dashboard,
      id: generateId('dashboard'),
      createdAt: now,
      updatedAt: now,
    };
  },

  async delete(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
  },

  async share(dashboardId: string, userIds: string[]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: await fetch(`/api/dashboards/${dashboardId}/share`, { method: 'POST', body: JSON.stringify({ userIds }) });
  },

  async unshare(dashboardId: string, userIds: string[]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // In production: await fetch(`/api/dashboards/${dashboardId}/unshare`, { method: 'POST', body: JSON.stringify({ userIds }) });
  },
};

/**
 * Provider Props
 */
interface DashboardProviderProps {
  children: React.ReactNode;
  initialDashboard?: Dashboard;
  defaultRefreshInterval?: number;
}

/**
 * DashboardProvider - Provides dashboard state and operations throughout the application
 *
 * Features:
 * - Dashboard CRUD operations
 * - Widget management (add, update, remove, move)
 * - Real-time data subscriptions with configurable intervals
 * - Dashboard sharing with permission controls
 * - Automatic refresh at configurable intervals
 */
export function DashboardProvider({
  children,
  initialDashboard,
  defaultRefreshInterval = DEFAULT_REFRESH_INTERVAL,
}: DashboardProviderProps) {
  // State
  const [dashboard, setDashboard] = useState<Dashboard | null>(initialDashboard || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshIntervalState] = useState(defaultRefreshInterval);

  // Refs for subscriptions and intervals
  const subscriptionsRef = useRef<Map<string, DashboardSubscription>>(new Map());
  const refreshTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const globalRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      // Clear all timers
      refreshTimersRef.current.forEach((timer) => clearInterval(timer));
      refreshTimersRef.current.clear();
      if (globalRefreshTimerRef.current) {
        clearInterval(globalRefreshTimerRef.current);
      }
    };
  }, []);

  // Set up global refresh timer
  useEffect(() => {
    if (globalRefreshTimerRef.current) {
      clearInterval(globalRefreshTimerRef.current);
    }

    if (dashboard && refreshInterval > 0) {
      globalRefreshTimerRef.current = setInterval(() => {
        // Trigger all subscriptions
        subscriptionsRef.current.forEach((sub) => {
          // In production, this would fetch real data
          sub.callback({ timestamp: new Date().toISOString() });
        });
      }, refreshInterval);
    }

    return () => {
      if (globalRefreshTimerRef.current) {
        clearInterval(globalRefreshTimerRef.current);
      }
    };
  }, [dashboard, refreshInterval]);

  // Dashboard operations
  const loadDashboard = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await dashboardApi.load(id);
      setDashboard(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveDashboard = useCallback(async (dashboardToSave: Dashboard) => {
    setIsLoading(true);
    setError(null);
    try {
      await dashboardApi.save(dashboardToSave);
      setDashboard({
        ...dashboardToSave,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dashboard');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createDashboard = useCallback(
    async (newDashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>) => {
      setIsLoading(true);
      setError(null);
      try {
        const created = await dashboardApi.create(newDashboard);
        setDashboard(created);
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create dashboard');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteDashboard = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await dashboardApi.delete(id);
      if (dashboard?.id === id) {
        setDashboard(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dashboard');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dashboard?.id]);

  // Widget operations
  const addWidget = useCallback((widget: Omit<DashboardWidget, 'id'>) => {
    if (!dashboard) return;

    const newWidget: DashboardWidget = {
      ...widget,
      id: generateId('widget'),
    };

    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: [...prev.widgets, newWidget],
        updatedAt: new Date().toISOString(),
      };
    });
  }, [dashboard]);

  const updateWidget = useCallback((id: string, updates: Partial<DashboardWidget>) => {
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === id ? { ...w, ...updates } : w
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.filter((w) => w.id !== id),
        updatedAt: new Date().toISOString(),
      };
    });

    // Clean up any subscriptions for this widget
    subscriptionsRef.current.forEach((sub, subId) => {
      if (sub.widgetId === id) {
        subscriptionsRef.current.delete(subId);
        const timer = refreshTimersRef.current.get(subId);
        if (timer) {
          clearInterval(timer);
          refreshTimersRef.current.delete(subId);
        }
      }
    });
  }, []);

  const moveWidget = useCallback((id: string, position: WidgetPosition) => {
    updateWidget(id, { position });
  }, [updateWidget]);

  // Subscription operations
  const subscribe = useCallback(
    (subscription: Omit<DashboardSubscription, 'id'>): string => {
      const id = generateId('sub');
      const fullSubscription: DashboardSubscription = { ...subscription, id };
      subscriptionsRef.current.set(id, fullSubscription);

      // Set up individual refresh timer if interval is specified
      if (subscription.interval && subscription.interval > 0) {
        const timer = setInterval(() => {
          // In production, this would fetch real data
          subscription.callback({ timestamp: new Date().toISOString() });
        }, subscription.interval);
        refreshTimersRef.current.set(id, timer);
      }

      return id;
    },
    []
  );

  const unsubscribe = useCallback((subscriptionId: string) => {
    subscriptionsRef.current.delete(subscriptionId);
    const timer = refreshTimersRef.current.get(subscriptionId);
    if (timer) {
      clearInterval(timer);
      refreshTimersRef.current.delete(subscriptionId);
    }
  }, []);

  // Sharing operations
  const shareDashboard = useCallback(
    async (dashboardId: string, userIds: string[]) => {
      setIsLoading(true);
      setError(null);
      try {
        await dashboardApi.share(dashboardId, userIds);
        if (dashboard?.id === dashboardId) {
          setDashboard((prev) => {
            if (!prev) return prev;
            const existingShared = prev.sharedWith || [];
            const newShared = [...new Set([...existingShared, ...userIds])];
            return {
              ...prev,
              isShared: true,
              sharedWith: newShared,
              updatedAt: new Date().toISOString(),
            };
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to share dashboard');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [dashboard?.id]
  );

  const unshareDashboard = useCallback(
    async (dashboardId: string, userIds: string[]) => {
      setIsLoading(true);
      setError(null);
      try {
        await dashboardApi.unshare(dashboardId, userIds);
        if (dashboard?.id === dashboardId) {
          setDashboard((prev) => {
            if (!prev) return prev;
            const existingShared = prev.sharedWith || [];
            const newShared = existingShared.filter((id) => !userIds.includes(id));
            return {
              ...prev,
              isShared: newShared.length > 0,
              sharedWith: newShared,
              updatedAt: new Date().toISOString(),
            };
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unshare dashboard');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [dashboard?.id]
  );

  // Refresh operations
  const refreshWidget = useCallback(async (widgetId: string) => {
    // Find subscriptions for this widget and trigger them
    subscriptionsRef.current.forEach((sub) => {
      if (sub.widgetId === widgetId) {
        // In production, this would fetch real data
        sub.callback({ timestamp: new Date().toISOString(), refreshed: true });
      }
    });
  }, []);

  const refreshAll = useCallback(async () => {
    // Trigger all subscriptions
    subscriptionsRef.current.forEach((sub) => {
      // In production, this would fetch real data
      sub.callback({ timestamp: new Date().toISOString(), refreshed: true });
    });
  }, []);

  const setRefreshInterval = useCallback((interval: number) => {
    setRefreshIntervalState(interval);
    if (dashboard) {
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          refreshInterval: interval,
          updatedAt: new Date().toISOString(),
        };
      });
    }
  }, [dashboard]);

  // Context value
  const value: DashboardContextValue = useMemo(
    () => ({
      dashboard,
      isLoading,
      error,
      loadDashboard,
      saveDashboard,
      createDashboard,
      deleteDashboard,
      addWidget,
      updateWidget,
      removeWidget,
      moveWidget,
      subscribe,
      unsubscribe,
      shareDashboard,
      unshareDashboard,
      refreshWidget,
      refreshAll,
      setRefreshInterval,
    }),
    [
      dashboard,
      isLoading,
      error,
      loadDashboard,
      saveDashboard,
      createDashboard,
      deleteDashboard,
      addWidget,
      updateWidget,
      removeWidget,
      moveWidget,
      subscribe,
      unsubscribe,
      shareDashboard,
      unshareDashboard,
      refreshWidget,
      refreshAll,
      setRefreshInterval,
    ]
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

/**
 * Hook to access dashboard context
 */
export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Hook to get current dashboard
 */
export function useCurrentDashboard(): Dashboard | null {
  const { dashboard } = useDashboard();
  return dashboard;
}

/**
 * Hook to get a specific widget
 */
export function useWidget(widgetId: string): DashboardWidget | undefined {
  const { dashboard } = useDashboard();
  return dashboard?.widgets.find((w) => w.id === widgetId);
}

/**
 * Hook to subscribe to widget data
 */
export function useWidgetSubscription(
  widgetId: string,
  dataSource: string,
  callback: (data: unknown) => void,
  interval?: number
): void {
  const { dashboard, subscribe, unsubscribe } = useDashboard();

  useEffect(() => {
    if (!dashboard) return;

    const subscriptionId = subscribe({
      dashboardId: dashboard.id,
      widgetId,
      dataSource,
      callback,
      interval,
    });

    return () => {
      unsubscribe(subscriptionId);
    };
  }, [dashboard, widgetId, dataSource, callback, interval, subscribe, unsubscribe]);
}
