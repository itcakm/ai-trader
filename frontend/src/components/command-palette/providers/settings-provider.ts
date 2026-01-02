/**
 * Settings search provider for Command Palette
 */

import type { SearchResult, SearchProvider } from '../types';
import { createSearchProvider, filterByQuery } from './base-provider';

// Settings items
const settingsItems: SearchResult[] = [
  {
    id: 'setting-profile',
    type: 'setting',
    title: 'Profile Settings',
    description: 'Manage your profile and account',
    path: '/settings/profile',
    keywords: ['profile', 'account', 'name', 'email', 'personal'],
    permission: { resource: 'user', action: 'read' },
  },
  {
    id: 'setting-security',
    type: 'setting',
    title: 'Security Settings',
    description: 'Password, MFA, and security options',
    path: '/settings/security',
    keywords: ['security', 'password', 'mfa', '2fa', 'authentication'],
    permission: { resource: 'user', action: 'update' },
  },
  {
    id: 'setting-notifications',
    type: 'setting',
    title: 'Notification Settings',
    description: 'Configure alerts and notifications',
    path: '/settings/notifications',
    keywords: ['notifications', 'alerts', 'email', 'push', 'sms'],
    permission: { resource: 'user', action: 'update' },
  },
  {
    id: 'setting-api-keys',
    type: 'setting',
    title: 'API Keys',
    description: 'Manage API keys and access tokens',
    path: '/settings/api-keys',
    keywords: ['api', 'keys', 'tokens', 'access', 'integration'],
    permission: { resource: 'user', action: 'update' },
  },
  {
    id: 'setting-exchange',
    type: 'setting',
    title: 'Exchange Connections',
    description: 'Configure exchange API connections',
    path: '/settings/exchanges',
    keywords: ['exchange', 'binance', 'coinbase', 'api', 'connection'],
    permission: { resource: 'exchange', action: 'read' },
  },
  {
    id: 'setting-risk',
    type: 'setting',
    title: 'Risk Settings',
    description: 'Configure risk limits and controls',
    path: '/settings/risk',
    keywords: ['risk', 'limits', 'controls', 'exposure', 'drawdown'],
    permission: { resource: 'risk_control', action: 'read' },
  },
  {
    id: 'setting-theme',
    type: 'setting',
    title: 'Theme & Appearance',
    description: 'Dark mode, light mode, and display options',
    path: '/settings/appearance',
    keywords: ['theme', 'dark', 'light', 'mode', 'appearance', 'display'],
  },
  {
    id: 'setting-language',
    type: 'setting',
    title: 'Language & Region',
    description: 'Language, timezone, and locale settings',
    path: '/settings/language',
    keywords: ['language', 'locale', 'timezone', 'region', 'translation'],
  },
  {
    id: 'setting-organization',
    type: 'setting',
    title: 'Organization Settings',
    description: 'Manage organization and team settings',
    path: '/settings/organization',
    keywords: ['organization', 'team', 'company', 'members', 'roles'],
    permission: { resource: 'organization', action: 'read' },
  },
  {
    id: 'setting-billing',
    type: 'setting',
    title: 'Billing & Subscription',
    description: 'Manage billing and subscription plans',
    path: '/settings/billing',
    keywords: ['billing', 'subscription', 'payment', 'plan', 'invoice'],
    permission: { resource: 'organization', action: 'read' },
  },
];

// Settings actions
const settingsActions: SearchResult[] = [
  {
    id: 'action-toggle-dark-mode',
    type: 'action',
    title: 'Toggle Dark Mode',
    description: 'Switch between light and dark theme',
    keywords: ['dark', 'light', 'theme', 'toggle', 'mode'],
  },
  {
    id: 'action-change-language',
    type: 'action',
    title: 'Change Language',
    description: 'Change the interface language',
    path: '/settings/language',
    keywords: ['language', 'change', 'translate', 'locale'],
  },
  {
    id: 'action-invite-member',
    type: 'action',
    title: 'Invite Team Member',
    description: 'Invite a new member to your organization',
    path: '/settings/organization/invite',
    keywords: ['invite', 'member', 'team', 'add', 'user'],
    permission: { resource: 'user', action: 'create' },
  },
];

/**
 * Search settings
 */
async function searchSettings(query: string): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const allItems = [...settingsItems, ...settingsActions];
  return filterByQuery(allItems, query);
}

/**
 * Get all settings
 */
async function getAllSettings(): Promise<SearchResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [...settingsItems, ...settingsActions];
}

/**
 * Create settings search provider
 */
export function createSettingsProvider(): SearchProvider {
  return createSearchProvider('setting', searchSettings, getAllSettings);
}

export default createSettingsProvider;
