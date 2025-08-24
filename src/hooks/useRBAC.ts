// Simple RBAC hook for Header component compatibility
import { useAuth } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRBAC() {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [roleDetails, setRoleDetails] = useState<Map<string, { name: string; display_name: string; priority: number; max_parallel_analysis?: number }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadPermissions() {
      if (!user) {
        setPermissions([]);
        setUserRoles([]);
        setRoleDetails(new Map());
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
          console.log('[useRBAC] User roles from RPC:', rolesData);
          console.log('[useRBAC] Role IDs to fetch:', roleIds);

          // Get role details directly from roles table
          const { data: rolesDetail, error: roleDetailError } = await supabase
            .from('roles')
            .select('*')
            .in('id', roleIds);

          console.log('[useRBAC] Roles detail query result:', { rolesDetail, roleDetailError });
          
          // Get role limits from role_limits table
          const { data: roleLimits, error: limitsError } = await supabase
            .from('role_limits')
            .select('*')
            .in('role_id', roleIds);
          
          console.log('[useRBAC] Role limits query result:', { roleLimits, limitsError });

          if (rolesDetail) {
            const roleMap = new Map();
            
            // Create a map of role limits for quick lookup
            const limitsMap = new Map();
            if (roleLimits) {
              roleLimits.forEach(limit => {
                limitsMap.set(limit.role_id, limit);
              });
            }
            
            rolesDetail.forEach(role => {
              console.log('[useRBAC] Adding role to map:', role);
              
              // Get limits from role_limits table
              const limits = limitsMap.get(role.id);
              console.log('[useRBAC] Role limits for', role.name, ':', limits);
              
              // Use limits from role_limits table, fallback to 1 if not found
              const maxParallelAnalysis = limits?.max_parallel_analysis ? Number(limits.max_parallel_analysis) : 1;
              console.log('[useRBAC] Final max_parallel_analysis for', role.name, ':', maxParallelAnalysis);
              
              roleMap.set(role.id, {
                name: role.name,
                display_name: role.display_name,
                priority: role.priority || 0,
                max_parallel_analysis: maxParallelAnalysis
              });
            });
            setRoleDetails(roleMap);
            console.log('[useRBAC] Final role map:', roleMap);
          }

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
            
            // Admins have all permissions
            if (isAdmin) {
              setPermissions(['*']);
            } else {
              setPermissions(userPermissions);
            }
          } else {
            // No role permissions found
            if (isAdmin) {
              setPermissions(['*']);
            } else {
              setPermissions([]);
            }
          }
        } else {
          setUserRoles([]);
          setRoleDetails(new Map());
          // Even if no roles found, admin still gets all permissions
          if (isAdmin) {
            setPermissions(['*']);
          } else {
            setPermissions([]);
          }
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        setPermissions([]);
        setUserRoles([]);
        setRoleDetails(new Map());
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

  const hasRole = (roleName: string): boolean => {
    if (!user) return false;
    if (isAdmin) return true;
    
    return userRoles.some(ur => {
      const roleDetail = roleDetails.get(ur.role_id);
      return roleDetail?.name === roleName;
    });
  };

  const hasAnyRole = (roleNames: string[]): boolean => {
    return roleNames.some(r => hasRole(r));
  };

  const hasAllRoles = (roleNames: string[]): boolean => {
    return roleNames.every(r => hasRole(r));
  };

  const canPerform = (resource: string, action: string): boolean => {
    // Check if user has specific permission for resource.action
    return hasPermission(`${resource}.${action}`);
  };

  const getPrimaryRole = () => {
    console.log('[useRBAC] getPrimaryRole called. userRoles:', userRoles, 'roleDetails size:', roleDetails.size);
    
    if (userRoles && userRoles.length > 0) {
      // Sort roles by priority (highest first) to get the primary role
      const sortedRoles = [...userRoles].sort((a, b) => {
        const aDetails = roleDetails.get(a.role_id);
        const bDetails = roleDetails.get(b.role_id);

        const aPriority = aDetails?.priority || 0;
        const bPriority = bDetails?.priority || 0;

        return bPriority - aPriority; // Higher priority first
      });

      const primaryRole = sortedRoles[0];
      console.log('[useRBAC] Primary role selected:', primaryRole);
      
      const roleDetail = roleDetails.get(primaryRole.role_id);
      console.log('[useRBAC] Role detail from map:', roleDetail);

      if (!roleDetail) {
        // This should not happen if data was fetched correctly
        console.error('[useRBAC] Role details not found for role:', primaryRole.role_name, 'Role ID:', primaryRole.role_id);
        console.error('[useRBAC] Available role details keys:', Array.from(roleDetails.keys()));
        return null;
      }

      const result = {
        name: primaryRole.role_name,
        display_name: roleDetail.display_name
      };
      console.log('[useRBAC] Returning role result:', result);
      return result;
    }

    console.log('[useRBAC] No user roles found, returning null');
    // No fallbacks - only use database values
    return null;
  };

  const getMaxParallelAnalysis = (): number => {
    // Admin gets unlimited (show as 10 for practical purposes)
    if (isAdmin) return 10;
    
    console.log('[useRBAC] getMaxParallelAnalysis called. userRoles:', userRoles);
    console.log('[useRBAC] roleDetails:', Array.from(roleDetails.entries()));
    
    // Get the highest limit from all user roles
    let maxLimit = 1; // Default to 1 if no roles found
    
    for (const userRole of userRoles) {
      const roleDetail = roleDetails.get(userRole.role_id);
      console.log('[useRBAC] Checking role:', userRole.role_id, 'Detail:', roleDetail);
      if (roleDetail && roleDetail.max_parallel_analysis) {
        console.log('[useRBAC] Found max_parallel_analysis:', roleDetail.max_parallel_analysis);
        maxLimit = Math.max(maxLimit, roleDetail.max_parallel_analysis);
      }
    }
    
    console.log('[useRBAC] Final maxLimit:', maxLimit);
    return maxLimit;
  };

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    canPerform,
    isAdmin,
    getPrimaryRole,
    getMaxParallelAnalysis
  };
}