// Simple RBAC hook for Header component compatibility
import { useAuth } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRBAC() {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadPermissions() {
      if (!user) {
        setPermissions([]);
        return;
      }

      // Admins have all permissions
      if (isAdmin) {
        setPermissions(['*']);
        return;
      }

      setIsLoading(true);
      try {
        // Use RPC function to get user roles
        const { data: rolesData, error: rolesError } = await supabase
          .rpc('get_user_roles', { p_user_id: user.id });

        if (!rolesError && rolesData && rolesData.length > 0) {
          setUserRoles(rolesData);
          const roleIds = rolesData.map((ur: any) => ur.role_id);
          
          // Get role permissions
          const { data: rolePerms } = await supabase
            .from('role_permissions')
            .select('permission_id')
            .in('role_id', roleIds);

          if (rolePerms && rolePerms.length > 0) {
            const permIds = rolePerms.map(rp => rp.permission_id);
            
            // Get permission names
            const { data: perms } = await supabase
              .from('permissions')
              .select('name')
              .in('id', permIds);

            const userPermissions = perms?.map(p => p.name) || [];
            setPermissions(userPermissions);
          } else {
            setPermissions([]);
          }
        } else {
          setUserRoles([]);
          setPermissions([]);
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        setPermissions([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPermissions();
  }, [user, isAdmin]);

  const hasPermission = (permission: string): boolean => {
    // No user means no permissions
    if (!user) return false;
    
    // Admins have all permissions
    if (isAdmin || permissions.includes('*')) return true;
    
    // Check specific permission
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => hasPermission(p));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => hasPermission(p));
  };

  const getPrimaryRole = () => {
    // Simple role system - just admin and default
    if (userRoles && userRoles.length > 0) {
      const admin = userRoles.find((r: any) => r.role_name === 'admin');
      if (admin) {
        return { name: 'admin', display_name: 'Administrator' };
      }
      
      // Return the first role (should be default)
      return {
        name: userRoles[0].role_name || 'default',
        display_name: userRoles[0].role_display_name || 'Default User'
      };
    }
    
    // Fallback check for isAdmin flag
    if (isAdmin) {
      return { name: 'admin', display_name: 'Administrator' };
    }
    
    return { name: 'default', display_name: 'Default User' };
  };

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    getPrimaryRole
  };
}