// Simple role management hook for AdminRoleManager compatibility
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export interface RoleLimit {
  role_id: string;
  max_parallel_analysis: number;
  max_watchlist_stocks: number;
  max_rebalance_stocks: number;
  max_scheduled_rebalances: number;
  max_debate_rounds?: number;
  schedule_resolution: string;
  optimization_mode?: string;
  number_of_search_sources?: number;
  rebalance_access: boolean;
  opportunity_agent_access: boolean;
  additional_provider_access: boolean;
  enable_live_trading: boolean;
  enable_auto_trading: boolean;
  near_limit_analysis_access: boolean;
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
  // New subscription and display fields
  color?: string;
  icon_url?: string;
  price_monthly?: number;
  price_yearly?: number;
  features?: any; // JSONB array of features
  discord_role_id?: string;
  stripe_product_id?: string;
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  // Flattened limits for easier access
  max_parallel_analysis: number;
  max_watchlist_stocks: number;
  max_rebalance_stocks: number;
  max_scheduled_rebalances: number;
  max_debate_rounds?: number;
  schedule_resolution: string;
  optimization_mode?: string;
  number_of_search_sources?: number;
  rebalance_access: boolean;
  opportunity_agent_access: boolean;
  additional_provider_access: boolean;
  enable_live_trading: boolean;
  enable_auto_trading: boolean;
  near_limit_analysis_access: boolean;
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
          // New subscription and display fields
          color: role.color,
          icon_url: role.icon_url,
          price_monthly: role.price_monthly,
          price_yearly: role.price_yearly,
          features: role.features,
          discord_role_id: role.discord_role_id,
          stripe_product_id: role.stripe_product_id,
          stripe_price_id_monthly: role.stripe_price_id_monthly,
          stripe_price_id_yearly: role.stripe_price_id_yearly,
          // Flatten limits for easier access in the component
          max_parallel_analysis: limits?.max_parallel_analysis ?? 1,
          max_watchlist_stocks: limits?.max_watchlist_stocks ?? 10,
          max_rebalance_stocks: limits?.max_rebalance_stocks ?? 5,
          max_scheduled_rebalances: limits?.max_scheduled_rebalances ?? 2,
          max_debate_rounds: limits?.max_debate_rounds ?? 2,
          schedule_resolution: limits?.schedule_resolution ?? 'Month',
          optimization_mode: limits?.optimization_mode ?? 'speed',
          number_of_search_sources: limits?.number_of_search_sources ?? 5,
          rebalance_access: limits?.rebalance_access ?? false,
          opportunity_agent_access: limits?.opportunity_agent_access ?? false,
          additional_provider_access: limits?.additional_provider_access ?? false,
          enable_live_trading: limits?.enable_live_trading ?? false,
          enable_auto_trading: limits?.enable_auto_trading ?? false,
          near_limit_analysis_access: limits?.near_limit_analysis_access ?? false
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
            max_parallel_analysis: 1,
            max_watchlist_stocks: 10,
            max_rebalance_stocks: 5,
            max_scheduled_rebalances: 2,
            schedule_resolution: 'Month',
            optimization_mode: 'speed',
            number_of_search_sources: 5,
            rebalance_access: false,
            opportunity_agent_access: false,
            additional_provider_access: false,
            enable_live_trading: false,
            enable_auto_trading: false,
            near_limit_analysis_access: false
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
    console.log('updateRole called with:', {
      roleId,
      updates,
      stripe_fields: {
        stripe_product_id: updates.stripe_product_id,
        stripe_price_id_monthly: updates.stripe_price_id_monthly,
        stripe_price_id_yearly: updates.stripe_price_id_yearly
      }
    });
    
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
      if (updates.name || updates.display_name || updates.description || updates.priority !== undefined || 
          updates.color !== undefined || updates.icon_url !== undefined || updates.price_monthly !== undefined || 
          updates.price_yearly !== undefined || updates.features !== undefined || updates.discord_role_id !== undefined ||
          updates.stripe_product_id !== undefined || updates.stripe_price_id_monthly !== undefined || updates.stripe_price_id_yearly !== undefined) {
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
          // Handle color - empty string should be saved as null
          if (updates.color !== undefined) updateData.color = updates.color || null;
          // Handle icon_url - empty string should be saved as null
          if (updates.icon_url !== undefined) updateData.icon_url = updates.icon_url || null;
          if (updates.price_monthly !== undefined) updateData.price_monthly = updates.price_monthly;
          if (updates.price_yearly !== undefined) updateData.price_yearly = updates.price_yearly;
          if (updates.features !== undefined) updateData.features = updates.features;
          // Handle Discord Role ID - empty string should be saved as null
          if (updates.discord_role_id !== undefined) updateData.discord_role_id = updates.discord_role_id || null;
          // Handle Stripe IDs - empty strings should be saved as null
          if (updates.stripe_product_id !== undefined) updateData.stripe_product_id = updates.stripe_product_id || null;
          if (updates.stripe_price_id_monthly !== undefined) updateData.stripe_price_id_monthly = updates.stripe_price_id_monthly || null;
          if (updates.stripe_price_id_yearly !== undefined) updateData.stripe_price_id_yearly = updates.stripe_price_id_yearly || null;
          
          console.log('Direct update - updateData:', updateData);
          console.log('Direct update - Stripe fields being saved:', {
            stripe_product_id: updateData.stripe_product_id,
            stripe_price_id_monthly: updateData.stripe_price_id_monthly,
            stripe_price_id_yearly: updateData.stripe_price_id_yearly
          });
          
          const { error: updateError } = await supabase
            .from('roles')
            .update(updateData)
            .eq('id', roleId);

          if (updateError) throw updateError;
        } else if (rpcError) {
          throw rpcError;
        } else {
          // RPC function exists and succeeded, but we still need to update the extended fields
          // since the RPC function might not handle them
          const extendedUpdateData: any = {};
          let hasExtendedUpdates = false;
          
          // Handle extended fields that might not be in the RPC function
          if (updates.color !== undefined) {
            extendedUpdateData.color = updates.color || null;
            hasExtendedUpdates = true;
          }
          if (updates.icon_url !== undefined) {
            extendedUpdateData.icon_url = updates.icon_url || null;
            hasExtendedUpdates = true;
          }
          if (updates.price_monthly !== undefined) {
            extendedUpdateData.price_monthly = updates.price_monthly;
            hasExtendedUpdates = true;
          }
          if (updates.price_yearly !== undefined) {
            extendedUpdateData.price_yearly = updates.price_yearly;
            hasExtendedUpdates = true;
          }
          if (updates.features !== undefined) {
            extendedUpdateData.features = updates.features;
            hasExtendedUpdates = true;
          }
          if (updates.discord_role_id !== undefined) {
            extendedUpdateData.discord_role_id = updates.discord_role_id || null;
            hasExtendedUpdates = true;
          }
          if (updates.stripe_product_id !== undefined) {
            extendedUpdateData.stripe_product_id = updates.stripe_product_id || null;
            hasExtendedUpdates = true;
          }
          if (updates.stripe_price_id_monthly !== undefined) {
            extendedUpdateData.stripe_price_id_monthly = updates.stripe_price_id_monthly || null;
            hasExtendedUpdates = true;
          }
          if (updates.stripe_price_id_yearly !== undefined) {
            extendedUpdateData.stripe_price_id_yearly = updates.stripe_price_id_yearly || null;
            hasExtendedUpdates = true;
          }
          
          // If there are extended fields to update, do a direct update for those
          if (hasExtendedUpdates) {
            console.log('Extended update - extendedUpdateData:', extendedUpdateData);
            console.log('Extended update - Stripe fields being saved:', {
              stripe_product_id: extendedUpdateData.stripe_product_id,
              stripe_price_id_monthly: extendedUpdateData.stripe_price_id_monthly,
              stripe_price_id_yearly: extendedUpdateData.stripe_price_id_yearly
            });
            
            const { error: extendedUpdateError } = await supabase
              .from('roles')
              .update(extendedUpdateData)
              .eq('id', roleId);
              
            if (extendedUpdateError) throw extendedUpdateError;
          }
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
      console.log('Role updated successfully');
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