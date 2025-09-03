import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Edit } from "lucide-react";
import { RoleWithLimits } from "@/hooks/useRoleManagement";
import { ExtendedRoleData } from "../types";
import DisplaySettingsSection from "./components/DisplaySettingsSection";
import PricingSection from "./components/PricingSection";
import FeaturesSection from "./components/FeaturesSection";

interface EditRoleDialogProps {
  editingRole: RoleWithLimits | null;
  editingRoleExtended: ExtendedRoleData | null;
  onClose: () => void;
  onUpdateRole: (role: RoleWithLimits) => void;
  onUpdateExtended: (data: ExtendedRoleData) => void;
  onSave: () => Promise<void>;
}

export default function EditRoleDialog({
  editingRole,
  editingRoleExtended,
  onClose,
  onUpdateRole,
  onUpdateExtended,
  onSave
}: EditRoleDialogProps) {
  if (!editingRole || !editingRoleExtended) return null;

  const isBuiltIn = ['admin', 'default'].includes(editingRole.role_name);

  return (
    <Dialog open={!!editingRole} onOpenChange={onClose}>
      <DialogContent className="!max-w-2xl !h-[90vh] !p-0 !flex !flex-col !gap-0">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Role: {editingRole.display_name}
          </DialogTitle>
          <DialogDescription>
            {isBuiltIn
              ? 'Built-in roles can only have their display name and description edited.'
              : 'Update role details'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
            <div className="space-y-4 pb-4">
            {!isBuiltIn && (
              <div>
                <Label>Role Name (lowercase, no spaces)</Label>
                <Input
                  value={editingRole.name}
                  onChange={(e) => onUpdateRole({
                    ...editingRole,
                    name: e.target.value.toLowerCase().replace(/\s/g, '_')
                  })}
                  placeholder="e.g., premium_user"
                />
              </div>
            )}
            <div>
              <Label>Display Name</Label>
              <Input
                value={editingRole.display_name}
                onChange={(e) => onUpdateRole({
                  ...editingRole,
                  display_name: e.target.value
                })}
                placeholder="e.g., Premium User"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editingRole.description || ''}
                onChange={(e) => onUpdateRole({
                  ...editingRole,
                  description: e.target.value
                })}
                placeholder="Role description..."
              />
            </div>
            <div>
              <Label>Priority (higher = more important)</Label>
              <Input
                type="number"
                value={editingRole.priority}
                onChange={(e) => onUpdateRole({
                  ...editingRole,
                  priority: parseInt(e.target.value) || 10
                })}
              />
            </div>

            <DisplaySettingsSection
              extendedData={editingRoleExtended}
              onUpdate={onUpdateExtended}
            />

            <PricingSection
              extendedData={editingRoleExtended}
              onUpdate={onUpdateExtended}
            />

            {/* Discord Integration */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Discord Integration</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="discord_role_id">Discord Role ID</Label>
                  <Input
                    id="discord_role_id"
                    value={editingRoleExtended.discord_role_id || ''}
                    onChange={(e) => onUpdateExtended({
                      ...editingRoleExtended,
                      discord_role_id: e.target.value
                    })}
                    placeholder="e.g., 1234567890123456789"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The Discord role ID to assign when users have this subscription role
                  </p>
                </div>
              </div>
            </div>

            {/* Lemon Squeezy Integration */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Lemon Squeezy Integration</h3>
              <div className="space-y-4">
                <div>
                  <Label>Monthly Variant ID</Label>
                  <Input
                    value={editingRoleExtended.lemon_squeezy_variant_id_monthly}
                    onChange={(e) => onUpdateExtended({
                      ...editingRoleExtended,
                      lemon_squeezy_variant_id_monthly: e.target.value
                    })}
                    placeholder="e.g., variant_abc123"
                  />
                </div>
                <div>
                  <Label>Yearly Variant ID</Label>
                  <Input
                    value={editingRoleExtended.lemon_squeezy_variant_id_yearly}
                    onChange={(e) => onUpdateExtended({
                      ...editingRoleExtended,
                      lemon_squeezy_variant_id_yearly: e.target.value
                    })}
                    placeholder="e.g., variant_xyz789"
                  />
                </div>
              </div>
            </div>

            <FeaturesSection
              extendedData={editingRoleExtended}
              onUpdate={onUpdateExtended}
            />
            </div>
          </div>
        </ScrollArea>

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}