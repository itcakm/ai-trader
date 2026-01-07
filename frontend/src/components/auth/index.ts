export { SessionExpiryModal } from './SessionExpiryModal';
export { MFAChallenge } from './MFAChallenge';
export { RouteGuard } from './RouteGuard';
export { RoleGuard } from './RoleGuard';
export { ProtectedLayout, PUBLIC_ROUTES, isPublicRoute } from './ProtectedLayout';

// Permission-based UI components (Requirements: 6.9)
export { PermissionGate, useHasPermission, useHasBackendPermission } from './PermissionGate';
export { RoleGate, useHasRole, useIsAdmin, useIsSuperAdmin } from './RoleGate';
export { PermissionButton, PermissionLink, PermissionIconButton } from './PermissionButton';
