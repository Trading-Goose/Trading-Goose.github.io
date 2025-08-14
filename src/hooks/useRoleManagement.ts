// Simple role management hook for AdminRoleManager compatibility
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export interface RoleLimit {
  role_id: string;
  max_analysis_per_day: number;
  max_rebalance_per_day: number;
  max_watchlist_stocks: number;
  max_rebalance_stocks: number;
  max_scheduled_rebalances: number;
  rebalance_access: boolean;
  opportunity_agent_access: boolean;
  additional_provider_access: boolean;
  enable_live_trading: boolean;
  enable_auto_trading: boolean;
}

export interface RoleWithLimits {
  id: string;
  name: string;
  display_name: string;
  description: string;
  priority: number;
  limits?: RoleLimit;
  permissions?: string[];
  // Compatibility properties for the component
  role_id: string;
  role_name: string;
  is_built_in?: boolean;
  // Flattened limits for easier access
  max_analysis_per_day: number;
  max_rebalance_per_day: number;
  max_watchlist_stocks: number;
  max_rebalance_stocks: number;
  max_scheduled_rebalances: number;
  rebalance_access: boolean;
  opportunity_agent_access: boolean;
  additional_provider_access: boolean;
  enable_live_trading: boolean;
  enable_auto_trading: boolean;
}

export function useRoleManagement() {
  const { isAdmin } = useAuth();
  const [roles, setRoles] = useState<RoleWithLimits[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const canManageRoles = isAdmin;

  // Load roles
  const loadRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('priority', { ascending: false });

      if (rolesError) throw rolesError;

      // Get role limits
      const { data: limitsData, error: limitsError } = await supabase
        .from('role_limits')
        .select('*');

      if (limitsError) throw limitsError;

      // Get role permissions
      const { data: rolePermsData } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id');

      // Get permission names
      const { data: permsData } = await supabase
        .from('permissions')
        .select('id, name');

      // Combine roles with limits and permissions
      const rolesWithLimits = rolesData?.map(role => {
        const rolePermIds = rolePermsData?.filter(rp => rp.role_id === role.id).map(rp => rp.permission_id) || [];
        const rolePermNames = permsData?.filter(p => rolePermIds.includes(p.id)).map(p => p.name) || [];
        const limits = limitsData?.find(l => l.role_id === role.id);
        
        return {
          id: role.id,
          role_id: role.id, // For compatibility with the component
          role_name: role.name, // For compatibility with the component
          name: role.name,
          display_name: role.display_name,
          description: role.description,
          priority: role.priority,
          is_built_in: role.is_built_in,
          limits,
          permissions: rolePermNames,
          // Flatten limits for easier access in the component
          max_analysis_per_day: limits?.max_analysis_per_day ?? 5,
          max_rebalance_per_day: limits?.max_rebalance_per_day ?? 2,
          max_watchlist_stocks: limits?.max_watchlist_stocks ?? 10,
          max_rebalance_stocks: limits?.max_rebalance_stocks ?? 5,
          max_scheduled_rebalances: limits?.max_scheduled_rebalances ?? 2,
          rebalance_access: limits?.rebalance_access ?? false,
          opportunity_agent_access: limits?.opportunity_agent_access ?? false,
          additional_provider_access: limits?.additional_provider_access ?? false,
          enable_live_trading: limits?.enable_live_trading ?? false,
          enable_auto_trading: limits?.enable_auto_trading ?? false
        };
      }) || [];

      setRoles(rolesWithLimits);
    } catch (err) {
      console.error('Error loading roles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  };

  // Create role - updated signature to match AdminRoleManager
  const createRole = async (name: string, display_name: string, description: string, priority: number) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name,
          display_name,
          description,
          priority
        })
        .select()
        .single();

      if (error) throw error;

      // Create default limits for the new role
      if (data) {
        await supabase
          .from('role_limits')
          .insert({
            role_id: data.id,
            max_analysis_per_day: 5,
            max_rebalance_per_day: 2,
            max_watchlist_stocks: 10,
            max_rebalance_stocks: 5,
            max_scheduled_rebalances: 2,
            rebalance_access: false,
            opportunity_agent_access: false,
            additional_provider_access: false,
            enable_live_trading: false,
            enable_auto_trading: false
          });
      }

      await loadRoles();
      return { success: true };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create role');
    }
  };

  // Update role - respects built-in role restrictions
  const updateRole = async (roleId: string, updates: Partial<RoleWithLimits>) => {
    if (!isAdmin) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      // First check if it's a built-in role and we're trying to rename it
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('name, is_built_in')
        .eq('id', roleId)
        .single();

      if (roleError) throw roleError;

      // Prevent renaming built-in roles
      if (roleData?.is_built_in && updates.name && updates.name !== roleData.name) {
        throw new Error(`Cannot rename built-in role ${roleData.name}`);
      }

      // Try RPC function first, fall back to direct update if it doesn't exist
      if (updates.name || updates.display_name || updates.description || updates.priority !== undefined) {
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('update_role_details', {
            p_role_id: roleId,
            p_name: updates.name || null,
            p_display_name: updates.display_name || null,
            p_description: updates.description || null,
            p_priority: updates.priority !== undefined ? updates.priority : null
          });

        // If RPC function doesn't exist, do direct update
        if (rpcError && rpcError.code === '42883') {
          // Function doesn't exist, do direct update
          const updateData: any = {};
          if (updates.name) updateData.name = updates.name;
          if (updates.display_name) updateData.display_name = updates.display_name;
          if (updates.description !== undefined) updateData.description = updates.description;
          if (updates.priority !== undefined) updateData.priority = updates.priority;
          
          const { error: updateError } = await supabase
            .from('roles')
            .update(updateData)
            .eq('id', roleId);

          if (updateError) throw updateError;
        } else if (rpcError) {
          throw rpcError;
        }
      }

      // Update limits if provided
      if (updates.limits) {
        const { error } = await supabase
          .from('role_limits')
          .upsert({
            ...updates.limits,
            role_id: roleId
          });

        if (error) throw error;
      }

      await loadRoles();
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Failed to update role' 
      };
    }
  };

  // Delete role - handles all dependencies properly
  const deleteRole = async (roleId: string) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      // Check if it's a built-in role
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('name, is_built_in')
        .eq('id', roleId)
        .single();

      if (roleError) throw roleError;
      
      if (roleData?.is_built_in) {
        throw new Error(`Cannot delete built-in role ${roleData.name}`);
      }

      // Try using RPC function first, fall back to manual deletion if it doesn't exist
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('delete_role_safely', { p_role_id: roleId });

      // If RPC function doesn't exist, do manual deletion
      if (rpcError && rpcError.code === '42883') {
        // Function doesn't exist, do manual deletion
        
        // 1. First UPDATE user_roles to deactivate instead of delete to avoid materialized view issues
        const { error: deactivateError } = await supabase
          .from('user_roles')
          .update({ is_active: false })
          .eq('role_id', roleId);
        
        if (deactivateError && deactivateError.code !== '42P01') {
          console.error('Error deactivating user_roles:', deactivateError);
        }

        // 2. Delete role_permissions
        const { error: permError } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId);

        if (permError && permError.code !== '42P01') {
          console.error('Error deleting role_permissions:', permError);
        }

        // 3. Delete role_limits
        const { error: limitsError } = await supabase
          .from('role_limits')
          .delete()
          .eq('role_id', roleId);

        if (limitsError && limitsError.code !== '42P01') {
          console.error('Error deleting role_limits:', limitsError);
        }

        // 4. Delete from role_audit_log if it exists
        const { error: auditError } = await supabase
          .from('role_audit_log')
          .delete()
          .eq('role_id', roleId);

        if (auditError && auditError.code !== '42P01') {
          console.error('Error deleting role_audit_log:', auditError);
        }

        // 5. Finally delete the role itself
        const { error: deleteError } = await supabase
          .from('roles')
          .delete()
          .eq('id', roleId);

        if (deleteError) throw deleteError;

        // 6. Clean up deactivated user_roles after role is deleted
        await supabase
          .from('user_roles')
          .delete()
          .eq('role_id', roleId)
          .eq('is_active', false);

      } else if (rpcError) {
        // RPC function exists but failed for another reason
        throw rpcError;
      }

      await loadRoles();
    } catch (err) {
      console.error('Delete role error:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  // Update role limits
  const updateRoleLimits = async (roleId: string, limits: Partial<RoleLimit>) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      const { error } = await supabase
        .from('role_limits')
        .update(limits)
        .eq('role_id', roleId);

      if (error) throw error;
      
      await loadRoles();
    } catch (err) {
      throw err;
    }
  };

  // Assign role to user
  const assignRole = async (userId: string, roleId: string) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_id: roleId,
          is_active: true
        });

      if (error) throw error;
    } catch (err) {
      throw err;
    }
  };

  // Revoke role from user
  const revokeRole = async (userId: string, roleId: string) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (error) throw error;
    } catch (err) {
      throw err;
    }
  };

  // Toggle role permission
  const toggleRolePermission = async (roleId: string, permission: string, grant: boolean) => {
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    try {
      if (grant) {
        // Get permission ID
        const { data: permData } = await supabase
          .from('permissions')
          .select('id')
          .eq('name', permission)
          .single();

        if (permData) {
          const { error } = await supabase
            .from('role_permissions')
            .insert({
              role_id: roleId,
              permission_id: permData.id
            });

          if (error && error.code !== '23505') { // Ignore duplicate key errors
            throw error;
          }
        }
      } else {
        // Remove permission
        const { data: permData } = await supabase
          .from('permissions')
          .select('id')
          .eq('name', permission)
          .single();

        if (permData) {
          const { error } = await supabase
            .from('role_permissions')
            .delete()
            .eq('role_id', roleId)
            .eq('permission_id', permData.id);

          if (error) throw error;
        }
      }
      
      // Refresh roles to update the UI
      await loadRoles();
    } catch (err) {
      throw err;
    }
  };

  return {
    roles,
    users,
    isLoading,
    error,
    canManageRoles,
    createRole,
    updateRole,
    deleteRole,
    updateRoleLimits,
    assignRole,
    revokeRole,
    toggleRolePermission,
    refresh: loadRoles
  };
}