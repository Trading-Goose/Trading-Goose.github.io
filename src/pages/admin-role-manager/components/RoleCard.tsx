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
      discord_role_id: role.discord_role_id || '',
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
        
        {/* Discord Role ID if configured */}
        {role.discord_role_id && (
          <div className="flex items-center gap-2 text-sm">
            <svg className="h-4 w-4" viewBox="0 0 127.14 96.36" fill="currentColor">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
            <span className="text-muted-foreground">Discord Role:</span>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{role.discord_role_id}</code>
          </div>
        )}
        
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