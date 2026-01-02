'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type {
  HelpContent,
  HelpUsageAction,
  HelpUsageEvent,
  HelpUsageStats,
  LocalizedHelpContent,
  ContextualHelpContextValue,
  HelpRegistryEntry,
} from '@/types/help';
import type { SupportedLocale } from '@/types/i18n';
import { useI18n } from './I18nProvider';

const ContextualHelpContext = createContext<ContextualHelpContextValue | undefined>(undefined);

// Maximum number of recent usage events to track
const MAX_RECENT_USAGE = 100;

// Default locale for fallback
const DEFAULT_LOCALE: SupportedLocale = 'en-US';

/**
 * Resolve help content to the current locale
 */
function resolveLocalizedContent(
  content: HelpContent,
  locale: SupportedLocale
): LocalizedHelpContent {
  const translation = content.translations[locale] || content.translations[DEFAULT_LOCALE];
  
  return {
    id: content.id,
    elementId: content.elementId,
    title: translation?.title || content.title,
    description: translation?.description || content.description,
    consequences: translation?.consequences || content.consequences,
    usage: translation?.usage || content.usage,
    learnMoreUrl: content.learnMoreUrl,
    videoUrl: content.videoUrl,
  };
}

export interface ContextualHelpProviderProps {
  children: React.ReactNode;
  initialHelpContent?: HelpContent[];
  onUsageTracked?: (event: HelpUsageEvent) => void;
}

export function ContextualHelpProvider({
  children,
  initialHelpContent = [],
  onUsageTracked,
}: ContextualHelpProviderProps) {
  // Help content registry
  const [helpRegistry, setHelpRegistry] = useState<Map<string, HelpRegistryEntry>>(() => {
    const registry = new Map<string, HelpRegistryEntry>();
    initialHelpContent.forEach((content) => {
      registry.set(content.elementId, { content, usageCount: 0 });
    });
    return registry;
  });

  // Active tooltip and panel state
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  // Usage tracking
  const usageEventsRef = useRef<HelpUsageEvent[]>([]);
  const usageStatsRef = useRef({
    totalViews: 0,
    totalExpands: 0,
    totalLinkClicks: 0,
  });

  // Get current locale from i18n context
  let locale: SupportedLocale = DEFAULT_LOCALE;
  try {
    const i18n = useI18n();
    locale = i18n.locale;
  } catch {
    // I18nProvider not available, use default locale
  }

  /**
   * Get raw help content by element ID
   */
  const getHelp = useCallback(
    (elementId: string): HelpContent | null => {
      const entry = helpRegistry.get(elementId);
      return entry?.content || null;
    },
    [helpRegistry]
  );

  /**
   * Get localized help content by element ID
   */
  const getLocalizedHelp = useCallback(
    (elementId: string): LocalizedHelpContent | null => {
      const content = getHelp(elementId);
      if (!content) return null;
      return resolveLocalizedContent(content, locale);
    },
    [getHelp, locale]
  );

  /**
   * Show tooltip for an element
   */
  const showTooltip = useCallback((elementId: string) => {
    setActiveTooltipId(elementId);
  }, []);

  /**
   * Hide active tooltip
   */
  const hideTooltip = useCallback(() => {
    setActiveTooltipId(null);
  }, []);

  /**
   * Show help panel for an element
   */
  const showHelpPanel = useCallback((elementId: string) => {
    setActivePanelId(elementId);
  }, []);

  /**
   * Hide active help panel
   */
  const hideHelpPanel = useCallback(() => {
    setActivePanelId(null);
  }, []);

  /**
   * Track help usage for analytics
   */
  const trackHelpUsage = useCallback(
    (elementId: string, action: HelpUsageAction) => {
      const event: HelpUsageEvent = {
        elementId,
        action,
        timestamp: new Date(),
        locale,
      };

      // Update usage events (keep only recent)
      usageEventsRef.current = [
        event,
        ...usageEventsRef.current.slice(0, MAX_RECENT_USAGE - 1),
      ];

      // Update stats
      switch (action) {
        case 'view':
          usageStatsRef.current.totalViews++;
          break;
        case 'expand':
          usageStatsRef.current.totalExpands++;
          break;
        case 'link_click':
          usageStatsRef.current.totalLinkClicks++;
          break;
      }

      // Update registry usage count
      setHelpRegistry((prev) => {
        const entry = prev.get(elementId);
        if (entry) {
          const newRegistry = new Map(prev);
          newRegistry.set(elementId, {
            ...entry,
            usageCount: entry.usageCount + 1,
            lastAccessed: new Date(),
          });
          return newRegistry;
        }
        return prev;
      });

      // Notify external handler
      onUsageTracked?.(event);
    },
    [locale, onUsageTracked]
  );

  /**
   * Register new help content
   */
  const registerHelp = useCallback((content: HelpContent) => {
    setHelpRegistry((prev) => {
      const newRegistry = new Map(prev);
      const existing = prev.get(content.elementId);
      newRegistry.set(content.elementId, {
        content,
        usageCount: existing?.usageCount || 0,
        lastAccessed: existing?.lastAccessed,
      });
      return newRegistry;
    });
  }, []);

  /**
   * Unregister help content
   */
  const unregisterHelp = useCallback((elementId: string) => {
    setHelpRegistry((prev) => {
      const newRegistry = new Map(prev);
      newRegistry.delete(elementId);
      return newRegistry;
    });
  }, []);

  /**
   * Get usage statistics
   */
  const getUsageStats = useCallback((): HelpUsageStats => {
    // Calculate most viewed elements
    const elementCounts = new Map<string, number>();
    usageEventsRef.current
      .filter((e) => e.action === 'view')
      .forEach((e) => {
        elementCounts.set(e.elementId, (elementCounts.get(e.elementId) || 0) + 1);
      });

    const mostViewedElements = Array.from(elementCounts.entries())
      .map(([elementId, count]) => ({ elementId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      ...usageStatsRef.current,
      mostViewedElements,
      recentUsage: usageEventsRef.current.slice(0, 20),
    };
  }, []);

  const contextValue: ContextualHelpContextValue = useMemo(
    () => ({
      getHelp,
      getLocalizedHelp,
      showTooltip,
      hideTooltip,
      showHelpPanel,
      hideHelpPanel,
      trackHelpUsage,
      registerHelp,
      unregisterHelp,
      activeTooltipId,
      activePanelId,
      getUsageStats,
    }),
    [
      getHelp,
      getLocalizedHelp,
      showTooltip,
      hideTooltip,
      showHelpPanel,
      hideHelpPanel,
      trackHelpUsage,
      registerHelp,
      unregisterHelp,
      activeTooltipId,
      activePanelId,
      getUsageStats,
    ]
  );

  return (
    <ContextualHelpContext.Provider value={contextValue}>
      {children}
    </ContextualHelpContext.Provider>
  );
}

/**
 * Hook to access contextual help context
 */
export function useContextualHelp(): ContextualHelpContextValue {
  const context = useContext(ContextualHelpContext);
  if (context === undefined) {
    throw new Error('useContextualHelp must be used within a ContextualHelpProvider');
  }
  return context;
}

/**
 * Hook to get help content for a specific element
 */
export function useHelp(elementId: string) {
  const { getLocalizedHelp, trackHelpUsage, showTooltip, showHelpPanel } = useContextualHelp();
  
  const help = getLocalizedHelp(elementId);
  
  const trackView = useCallback(() => {
    trackHelpUsage(elementId, 'view');
  }, [elementId, trackHelpUsage]);

  const trackExpand = useCallback(() => {
    trackHelpUsage(elementId, 'expand');
  }, [elementId, trackHelpUsage]);

  const trackLinkClick = useCallback(() => {
    trackHelpUsage(elementId, 'link_click');
  }, [elementId, trackHelpUsage]);

  const openTooltip = useCallback(() => {
    showTooltip(elementId);
    trackView();
  }, [elementId, showTooltip, trackView]);

  const openPanel = useCallback(() => {
    showHelpPanel(elementId);
    trackExpand();
  }, [elementId, showHelpPanel, trackExpand]);

  return {
    help,
    trackView,
    trackExpand,
    trackLinkClick,
    openTooltip,
    openPanel,
  };
}

// Export for testing
export { resolveLocalizedContent, ContextualHelpContext };
