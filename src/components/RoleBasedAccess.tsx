import { ReactNode } from 'react';
import { useRBAC } from '@/hooks/useRBAC';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Lock } from 'lucide-react';

interface RoleGateProps {
  children: ReactNode;
  roles?: string[];
  permissions?: string[];
  resource?: string;
  action?: string;
  requireAll?: boolean;
  fallback?: ReactNode;
  showError?: boolean;
}

/**
 * Component that conditionally renders children based on user's roles/permissions
 * 
 * @example
 * // Require admin role
 * <RoleGate roles={['admin']}>
 *   <AdminPanel />
 * </RoleGate>
 * 
 * // Require specific permission
 * <RoleGate permissions={['users.create']}>
 *   <CreateUserButton />
 * </RoleGate>
 * 
 * // Require resource action
 * <RoleGate resource="analysis" action="delete">
 *   <DeleteButton />
 * </RoleGate>
 */
export function RoleGate({
  children,
  roles,
  permissions,
  resource,
  action,
  requireAll = false,
  fallback = null,
  showError = false
}: RoleGateProps) {
  const { 
    hasRole, 
    hasAnyRole, 
    hasAllRoles,
    hasPermission, 
    hasAnyPermission, 
    hasAllPermissions,
    canPerform,
    isLoading 
  } = useRBAC();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  let hasAccess = false;

  // Check roles
  if (roles && roles.length > 0) {
    hasAccess = requireAll ? hasAllRoles(roles) : hasAnyRole(roles);
  }

  // Check permissions
  if (permissions && permissions.length > 0) {
    const permAccess = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
    hasAccess = hasAccess || permAccess;
  }

  // Check resource/action
  if (resource && action) {
    hasAccess = hasAccess || canPerform(resource, action);
  }

  if (!hasAccess) {
    if (showError) {
      return (
        <Alert className="border-red-200 bg-red-50">
          <Lock className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            You don't have permission to access this content.
          </AlertDescription>
        </Alert>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface PermissionCheckProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Simple permission check component
 * 
 * @example
 * <PermissionCheck permission="users.delete">
 *   <DeleteUserButton />
 * </PermissionCheck>
 */
export function PermissionCheck({ permission, children, fallback = null }: PermissionCheckProps) {
  const { hasPermission } = useRBAC();
  
  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

interface RoleCheckProps {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Simple role check component
 * 
 * @example
 * <RoleCheck role="admin">
 *   <AdminDashboard />
 * </RoleCheck>
 */
export function RoleCheck({ role, children, fallback = null }: RoleCheckProps) {
  const { hasRole } = useRBAC();
  
  if (!hasRole(role)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

interface RoleBadgeProps {
  className?: string;
}

/**
 * Displays the user's primary role as a badge
 */
export function RoleBadge({ className = '' }: RoleBadgeProps) {
  const { getPrimaryRole } = useRBAC();
  const primaryRole = getPrimaryRole();
  
  console.log('[RoleBadge] Primary role:', primaryRole);
  
  if (!primaryRole) return null;
  
  // Default colors as fallback
  const defaultRoleColors: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-800 border-purple-200',
    admin: 'bg-blue-100 text-blue-800 border-blue-200',
    moderator: 'bg-green-100 text-green-800 border-green-200',
    analyst: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    user: 'bg-gray-100 text-gray-800 border-gray-200',
    guest: 'bg-gray-50 text-gray-600 border-gray-200'
  };
  
  // Use custom color if available, otherwise fall back to default
  const hasCustomColor = primaryRole.color;
  const defaultColorClass = defaultRoleColors[primaryRole.name] || defaultRoleColors.user;
  
  // Create style object for custom color
  const customStyle = hasCustomColor ? {
    backgroundColor: `${primaryRole.color}20`, // 20 is for opacity (12.5%)
    color: primaryRole.color,
    borderColor: `${primaryRole.color}40` // 40 is for opacity (25%)
  } : {};
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${!hasCustomColor ? defaultColorClass : ''} ${className}`}
      style={hasCustomColor ? customStyle : {}}
    >
      {primaryRole.display_name}
    </span>
  );
}

interface ResourceActionGateProps {
  resource: string;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Check if user can perform specific action on resource
 * 
 * @example
 * <ResourceActionGate resource="analysis" action="export">
 *   <ExportButton />
 * </ResourceActionGate>
 */
export function ResourceActionGate({ 
  resource, 
  action, 
  children, 
  fallback = null 
}: ResourceActionGateProps) {
  const { canPerform } = useRBAC();
  
  if (!canPerform(resource, action)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}