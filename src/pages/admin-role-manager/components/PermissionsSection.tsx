import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "../constants";

interface PermissionsSectionProps {
  roleId: string;
  permissions: string[] | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTogglePermission: (roleId: string, permission: string, currentState: boolean) => Promise<void>;
}

export default function PermissionsSection({
  roleId,
  permissions,
  isExpanded,
  onToggleExpand,
  onTogglePermission
}: PermissionsSectionProps) {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleExpand}
        className="w-full justify-between"
      >
        <span>Permissions ({permissions?.length || 0})</span>
        {isExpanded ?
          <ChevronUp className="h-4 w-4" /> :
          <ChevronDown className="h-4 w-4" />
        }
      </Button>

      {isExpanded && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          {ALL_PERMISSIONS.map(perm => {
            const hasPermission = permissions?.includes(perm) || false;
            return (
              <div key={perm} className="flex items-center space-x-2">
                <Switch
                  checked={hasPermission}
                  onCheckedChange={() => onTogglePermission(roleId, perm, hasPermission)}
                />
                <Label className="text-xs">{PERMISSION_LABELS[perm] || perm}</Label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}