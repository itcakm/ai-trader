/**
 * RBAC (Role-Based Access Control) UI Components
 * 
 * Components for permission-based conditional rendering and route protection
 */

export { PermissionGate, PermissionDenied } from './PermissionGate';
export { withPermission, createProtectedRoute } from './withPermission';
export {
  PermissionMenu,
  usePermissionMenu,
  DEFAULT_NAV_ITEMS,
  type PermissionMenuItem,
} from './PermissionMenu';

// Role Management Components
export { RoleList } from './RoleList';
export { RoleForm } from './RoleForm';
export { RoleManagement } from './RoleManagement';
