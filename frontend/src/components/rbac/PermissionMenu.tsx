'use client';

import React, { useMemo } from 'react';
import { useRBAC, useVisibleModules } from '@/providers/RBACProvider';
import type { ResourceType, ActionType, PermissionCheck, ModuleType } from '@/types/rbac';

/**
 * Menu item with permission requirements
 */
export interface PermissionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /**
   * Single permission requirement
   */
  resource?: ResourceType;
  action?: ActionType;
  /**
   * Multiple permission requirements
   */
  permissions?: PermissionCheck[];
  /**
   * If true, requires ALL permissions. Default: false (any)
   */
  requireAll?: boolean;
  /**
   * Associated module (for module-based filtering)
   */
  module?: ModuleType;
  /**
   * Nested menu items
   */
  children?: PermissionMenuItem[];
  /**
   * If true, item is always visible regardless of permissions
   */
  alwaysVisible?: boolean;
  /**
   * Divider before this item
   */
  dividerBefore?: boolean;
}

interface UsePermissionMenuOptions {
  /**
   * If true, filters by module visibility in addition to item permissions
   */
  filterByModule?: boolean;
}

/**
 * Hook to filter menu items based on user permissions
 * 
 * Usage:
 * ```tsx
 * const menuItems: PermissionMenuItem[] = [
 *   { id: 'dashboard', label: 'Dashboard', alwaysVisible: true },
 *   { id: 'strategies', label: 'Strategies', resource: 'strategy', action: 'read' },
 *   { id: 'orders', label: 'Orders', resource: 'order', action: 'read' },
 *   { id: 'admin', label: 'Admin', permissions: [
 *     { resource: 'user', action: 'read' },
 *     { resource: 'role', action: 'read' }
 *   ], requireAll: true },
 * ];
 * 
 * const { visibleItems } = usePermissionMenu(menuItems);
 * ```
 */
export function usePermissionMenu(
  items: PermissionMenuItem[],
  options: UsePermissionMenuOptions = {}
): { visibleItems: PermissionMenuItem[] } {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useRBAC();
  const visibleModules = useVisibleModules();
  const { filterByModule = false } = options;

  const visibleItems = useMemo(() => {
    function filterItems(menuItems: PermissionMenuItem[]): PermissionMenuItem[] {
      return menuItems
        .filter((item) => {
          // Always visible items bypass permission checks
          if (item.alwaysVisible) {
            return true;
          }

          // Check module visibility if enabled
          if (filterByModule && item.module) {
            if (!visibleModules.includes(item.module)) {
              return false;
            }
          }

          // Check permissions
          if (item.resource && item.action) {
            return hasPermission(item.resource, item.action);
          }

          if (item.permissions && item.permissions.length > 0) {
            return item.requireAll
              ? hasAllPermissions(item.permissions)
              : hasAnyPermission(item.permissions);
          }

          // No permissions specified - visible by default
          return true;
        })
        .map((item) => {
          // Recursively filter children
          if (item.children && item.children.length > 0) {
            const filteredChildren = filterItems(item.children);
            // Only include parent if it has visible children
            if (filteredChildren.length === 0) {
              return null;
            }
            return { ...item, children: filteredChildren };
          }
          return item;
        })
        .filter((item): item is PermissionMenuItem => item !== null);
    }

    return filterItems(items);
  }, [items, hasPermission, hasAnyPermission, hasAllPermissions, visibleModules, filterByModule]);

  return { visibleItems };
}

/**
 * Props for PermissionMenu component
 */
interface PermissionMenuProps {
  items: PermissionMenuItem[];
  /**
   * If true, filters by module visibility in addition to item permissions
   */
  filterByModule?: boolean;
  /**
   * Render function for menu items
   */
  renderItem: (item: PermissionMenuItem, index: number) => React.ReactNode;
  /**
   * Render function for dividers
   */
  renderDivider?: () => React.ReactNode;
  /**
   * CSS class for the menu container
   */
  className?: string;
}

/**
 * PermissionMenu - Renders a menu with items filtered by user permissions
 * 
 * Usage:
 * ```tsx
 * <PermissionMenu
 *   items={menuItems}
 *   renderItem={(item) => (
 *     <a href={item.href} className="menu-item">
 *       {item.icon}
 *       {item.label}
 *     </a>
 *   )}
 * />
 * ```
 */
export function PermissionMenu({
  items,
  filterByModule = false,
  renderItem,
  renderDivider,
  className,
}: PermissionMenuProps) {
  const { visibleItems } = usePermissionMenu(items, { filterByModule });

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <nav className={className}>
      {visibleItems.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && renderDivider?.()}
          {renderItem(item, index)}
        </React.Fragment>
      ))}
    </nav>
  );
}

/**
 * Default navigation menu items for the trading system
 */
export const DEFAULT_NAV_ITEMS: PermissionMenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    alwaysVisible: true,
  },
  {
    id: 'strategies',
    label: 'Strategies',
    href: '/strategies',
    resource: 'strategy',
    action: 'read',
    module: 'strategy_management',
  },
  {
    id: 'orders',
    label: 'Orders',
    href: '/orders',
    resource: 'order',
    action: 'read',
    module: 'exchange_integration',
  },
  {
    id: 'positions',
    label: 'Positions',
    href: '/positions',
    resource: 'position',
    action: 'read',
    module: 'exchange_integration',
  },
  {
    id: 'market-data',
    label: 'Market Data',
    href: '/market-data',
    resource: 'market_data',
    action: 'read',
    module: 'market_data',
  },
  {
    id: 'ai-intelligence',
    label: 'AI Intelligence',
    href: '/ai',
    resource: 'ai_model',
    action: 'read',
    module: 'ai_intelligence',
  },
  {
    id: 'risk-controls',
    label: 'Risk Controls',
    href: '/risk',
    resource: 'risk_control',
    action: 'read',
    module: 'risk_controls',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/reports',
    resource: 'report',
    action: 'read',
    module: 'reporting',
    dividerBefore: true,
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    href: '/audit',
    resource: 'audit_log',
    action: 'read',
    module: 'reporting',
  },
  {
    id: 'admin',
    label: 'Administration',
    href: '/admin',
    permissions: [
      { resource: 'user', action: 'read' },
      { resource: 'role', action: 'read' },
    ],
    module: 'administration',
    dividerBefore: true,
    children: [
      {
        id: 'admin-users',
        label: 'Users',
        href: '/admin/users',
        resource: 'user',
        action: 'read',
      },
      {
        id: 'admin-roles',
        label: 'Roles',
        href: '/admin/roles',
        resource: 'role',
        action: 'read',
      },
      {
        id: 'admin-org',
        label: 'Organization',
        href: '/admin/organization',
        resource: 'organization',
        action: 'read',
      },
    ],
  },
];

export default PermissionMenu;
