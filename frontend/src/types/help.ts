/**
 * Contextual Help types for the AI-Assisted Crypto Trading System
 * Provides in-context guidance and documentation for UI elements
 */

import type { SupportedLocale } from './i18n';

/**
 * Help usage action types for analytics tracking
 */
export type HelpUsageAction = 'view' | 'expand' | 'link_click';

/**
 * Help display variant types
 */
export type HelpVariant = 'tooltip' | 'inline' | 'panel';

/**
 * Translation content for a specific locale
 */
export interface HelpTranslation {
  title: string;
  description: string;
  consequences?: string;
  usage?: string;
}

/**
 * Help content structure for a UI element
 */
export interface HelpContent {
  id: string;
  elementId: string;
  title: string;
  description: string;
  consequences?: string;
  usage?: string;
  learnMoreUrl?: string;
  videoUrl?: string;
  translations: Partial<Record<SupportedLocale, HelpTranslation>>;
}

/**
 * Help usage event for analytics
 */
export interface HelpUsageEvent {
  elementId: string;
  action: HelpUsageAction;
  timestamp: Date;
  locale: SupportedLocale;
}

/**
 * Help registry entry
 */
export interface HelpRegistryEntry {
  content: HelpContent;
  usageCount: number;
  lastAccessed?: Date;
}

/**
 * Contextual Help context value
 */
export interface ContextualHelpContextValue {
  getHelp: (elementId: string) => HelpContent | null;
  getLocalizedHelp: (elementId: string) => LocalizedHelpContent | null;
  showTooltip: (elementId: string) => void;
  hideTooltip: () => void;
  showHelpPanel: (elementId: string) => void;
  hideHelpPanel: () => void;
  trackHelpUsage: (elementId: string, action: HelpUsageAction) => void;
  registerHelp: (content: HelpContent) => void;
  unregisterHelp: (elementId: string) => void;
  activeTooltipId: string | null;
  activePanelId: string | null;
  getUsageStats: () => HelpUsageStats;
}

/**
 * Localized help content (resolved for current locale)
 */
export interface LocalizedHelpContent {
  id: string;
  elementId: string;
  title: string;
  description: string;
  consequences?: string;
  usage?: string;
  learnMoreUrl?: string;
  videoUrl?: string;
}

/**
 * Help usage statistics for analytics
 */
export interface HelpUsageStats {
  totalViews: number;
  totalExpands: number;
  totalLinkClicks: number;
  mostViewedElements: Array<{ elementId: string; count: number }>;
  recentUsage: HelpUsageEvent[];
}

/**
 * Props for WithHelp wrapper component
 */
export interface WithHelpProps {
  helpId: string;
  variant?: HelpVariant;
  children: React.ReactNode;
  showIcon?: boolean;
  iconPosition?: 'left' | 'right';
}

/**
 * Props for HelpTooltip component
 */
export interface HelpTooltipProps {
  content: LocalizedHelpContent;
  visible: boolean;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
}

/**
 * Props for HelpPanel component
 */
export interface HelpPanelProps {
  content: LocalizedHelpContent;
  visible: boolean;
  onClose: () => void;
}

/**
 * Props for InlineHelp component
 */
export interface InlineHelpProps {
  content: LocalizedHelpContent;
  expanded?: boolean;
  onToggle?: () => void;
}
