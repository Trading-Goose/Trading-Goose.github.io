import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Settings, Trash2 } from "lucide-react";
import { RoleWithLimits } from "@/hooks/useRoleManagement";
import { ExtendedRoleData } from "../types";
import LimitsDisplay from "./LimitsDisplay";
import PermissionsSection from "./PermissionsSection";

interface RoleCardProps {
  role: RoleWithLimits;
  isPermissionsExpanded: boolean;
  onTogglePermissions: () => void;
  onEditRole: (role: RoleWithLimits, extended: ExtendedRoleData) => void;
  onEditLimits: (role: RoleWithLimits) => void;
  onDeleteRole: (roleId: string, roleName: string) => void;
  onTogglePermission: (roleId: string, permission: string, currentState: boolean) => Promise<void>;
}

export default function RoleCard({
  role,
  isPermissionsExpanded,
  onTogglePermissions,
  onEditRole,
  onEditLimits,
  onDeleteRole,
  onTogglePermission
}: RoleCardProps) {
  const isBuiltIn = ['admin', 'default'].includes(role.role_name);

  const handleEditRole = () => {
    const extendedData: ExtendedRoleData = {
      color: role.color || '',
      icon_url: role.icon_url || '',
      price_monthly: role.price_monthly ?? null,
      price_yearly: role.price_yearly ?? null,
      features: role.features || [],
      lemon_squeezy_variant_id_monthly: role.lemon_squeezy_variant_id_monthly || '',
      lemon_squeezy_variant_id_yearly: role.lemon_squeezy_variant_id_yearly || ''
    };
    onEditRole(role, extendedData);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {role.display_name}
              {isBuiltIn && (
                <Badge variant="secondary">Built-in</Badge>
              )}
              <Badge variant="outline">Priority: {role.priority}</Badge>
            </CardTitle>
            <CardDescription>{role.role_name}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleEditRole}
              title="Edit role details"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEditLimits(role)}
            >
              <Settings className="h-4 w-4 mr-1" />
              Limits
            </Button>
            {!isBuiltIn && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDeleteRole(role.id, role.display_name)}
                title="Delete custom role"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline compact display of limits */}
        <LimitsDisplay role={role} />
        
        {/* Collapsible permissions section */}
        <PermissionsSection
          roleId={role.id}
          permissions={role.permissions}
          isExpanded={isPermissionsExpanded}
          onToggleExpand={onTogglePermissions}
          onTogglePermission={onTogglePermission}
        />
      </CardContent>
    </Card>
  );
}