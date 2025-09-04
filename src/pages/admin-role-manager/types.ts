import { RoleWithLimits } from "@/hooks/useRoleManagement";

export interface NewRoleForm {
  name: string;
  display_name: string;
  description: string;
  priority: number;
}

export interface ExtendedRoleData {
  color: string;
  icon_url: string;
  price_monthly: number | null;
  price_yearly: number | null;
  features: string[];
  discord_role_id: string;
  stripe_product_id: string;
  stripe_price_id_monthly: string;
  stripe_price_id_yearly: string;
}

export interface RoleActionsHandlers {
  handleSaveLimits: () => Promise<void>;
  handleTogglePermission: (roleId: string, permission: string, currentState: boolean) => Promise<void>;
  handleCreateRole: () => Promise<void>;
  handleDeleteRole: (roleId: string, roleName: string) => Promise<void>;
  handleUpdateRole: () => Promise<void>;
}

export interface RoleManagerState {
  selectedRole: RoleWithLimits | null;
  editingLimits: RoleWithLimits | null;
  editingRole: RoleWithLimits | null;
  editingRoleExtended: ExtendedRoleData | null;
  expandedPermissions: string[];
  isCreatingRole: boolean;
  newRole: NewRoleForm;
}