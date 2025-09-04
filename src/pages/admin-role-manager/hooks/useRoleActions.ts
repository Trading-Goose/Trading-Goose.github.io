import { useToast } from "@/hooks/use-toast";
import { RoleWithLimits } from "@/hooks/useRoleManagement";
import { NewRoleForm } from "../types";

interface UseRoleActionsProps {
  updateRoleLimits: any;
  updateRole: any;
  toggleRolePermission: any;
  createRole: any;
  deleteRole: any;
  refresh: () => Promise<void>;
}

export function useRoleActions({
  updateRoleLimits,
  updateRole,
  toggleRolePermission,
  createRole,
  deleteRole,
  refresh
}: UseRoleActionsProps) {
  const { toast } = useToast();

  const handleSaveLimits = async (editingLimits: RoleWithLimits) => {
    try {
      await updateRoleLimits(editingLimits.id, {
        role_id: editingLimits.id,
        max_parallel_analysis: editingLimits.max_parallel_analysis,
        max_watchlist_stocks: editingLimits.max_watchlist_stocks,
        max_rebalance_stocks: editingLimits.max_rebalance_stocks,
        max_scheduled_rebalances: editingLimits.max_scheduled_rebalances,
        schedule_resolution: editingLimits.schedule_resolution,
        optimization_mode: editingLimits.optimization_mode,
        number_of_search_sources: editingLimits.number_of_search_sources,
        rebalance_access: editingLimits.rebalance_access,
        opportunity_agent_access: editingLimits.opportunity_agent_access,
        additional_provider_access: editingLimits.additional_provider_access,
        enable_live_trading: editingLimits.enable_live_trading,
        enable_auto_trading: editingLimits.enable_auto_trading
      });

      toast({
        title: "Success",
        description: `Role limits updated for ${editingLimits.display_name}`,
      });

      await refresh();
      return true;
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update role limits",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleTogglePermission = async (roleId: string, permission: string, currentState: boolean) => {
    try {
      await toggleRolePermission(roleId, permission, !currentState);
      toast({
        title: "Success",
        description: `Permission ${!currentState ? 'granted' : 'revoked'}`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to toggle permission",
        variant: "destructive"
      });
    }
  };

  const handleCreateRole = async (newRole: NewRoleForm) => {
    try {
      await createRole(
        newRole.name,
        newRole.display_name,
        newRole.description,
        newRole.priority
      );

      toast({
        title: "Success",
        description: `Role "${newRole.display_name}" created successfully`,
      });
      return true;
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create role",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteRole(roleId);
      toast({
        title: "Success",
        description: `Role "${roleName}" deleted successfully`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete role",
        variant: "destructive"
      });
    }
  };

  const handleUpdateRole = async (editingRole: RoleWithLimits, editingRoleExtended: any) => {
    try {
      const updateData = {
        name: editingRole.name,
        display_name: editingRole.display_name,
        description: editingRole.description,
        priority: editingRole.priority,
        color: editingRoleExtended?.color,
        icon_url: editingRoleExtended?.icon_url,
        price_monthly: editingRoleExtended?.price_monthly,
        price_yearly: editingRoleExtended?.price_yearly,
        features: editingRoleExtended?.features,
        discord_role_id: editingRoleExtended?.discord_role_id,
        stripe_product_id: editingRoleExtended?.stripe_product_id,
        stripe_price_id_monthly: editingRoleExtended?.stripe_price_id_monthly,
        stripe_price_id_yearly: editingRoleExtended?.stripe_price_id_yearly
      };
      
      console.log('Updating role with data:', updateData);
      console.log('Stripe fields:', {
        stripe_product_id: updateData.stripe_product_id,
        stripe_price_id_monthly: updateData.stripe_price_id_monthly,
        stripe_price_id_yearly: updateData.stripe_price_id_yearly
      });
      
      const result = await updateRole(editingRole.id, updateData);

      if (result.success) {
        toast({
          title: "Success",
          description: `Role "${editingRole.display_name}" updated successfully`,
        });
        await refresh(); // Reload roles from database to get the updated data
        return true;
      } else {
        throw new Error(result.error || 'Failed to update role');
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update role",
        variant: "destructive"
      });
      return false;
    }
  };

  return {
    handleSaveLimits,
    handleTogglePermission,
    handleCreateRole,
    handleDeleteRole,
    handleUpdateRole
  };
}