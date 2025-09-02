import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Settings2 } from "lucide-react";
import { RoleWithLimits } from "@/hooks/useRoleManagement";
import { SCHEDULE_RESOLUTIONS, OPTIMIZATION_MODES } from "../constants";
import NumericLimitsSection from "./components/NumericLimitsSection";
import AccessFlagsSection from "./components/AccessFlagsSection";

interface EditLimitsDialogProps {
  editingLimits: RoleWithLimits | null;
  onClose: () => void;
  onUpdateLimits: (limits: RoleWithLimits) => void;
  onSave: () => Promise<void>;
}

export default function EditLimitsDialog({
  editingLimits,
  onClose,
  onUpdateLimits,
  onSave
}: EditLimitsDialogProps) {
  if (!editingLimits) return null;

  const handleResolutionToggle = (resolution: string, checked: boolean | string) => {
    const resolutions = editingLimits.schedule_resolution?.split(',') || [];
    let newResolutions = [...resolutions];
    
    if (checked) {
      if (!newResolutions.includes(resolution)) {
        newResolutions.push(resolution);
      }
    } else {
      newResolutions = newResolutions.filter(r => r !== resolution);
    }
    
    // Ensure at least one resolution is selected
    if (newResolutions.length === 0) {
      newResolutions = ['Month'];
    }
    
    onUpdateLimits({
      ...editingLimits,
      schedule_resolution: newResolutions.join(',')
    });
  };

  const handleModeToggle = (mode: string, checked: boolean | string) => {
    const modes = editingLimits.optimization_mode?.split(',') || [];
    let newModes = [...modes];
    
    if (checked) {
      if (!newModes.includes(mode)) {
        newModes.push(mode);
      }
    } else {
      newModes = newModes.filter(m => m !== mode);
    }
    
    // Ensure at least one mode is selected
    if (newModes.length === 0) {
      newModes = ['speed'];
    }
    
    onUpdateLimits({ 
      ...editingLimits, 
      optimization_mode: newModes.join(',') 
    });
  };

  return (
    <Dialog open={!!editingLimits} onOpenChange={onClose}>
      <DialogContent className="!max-w-2xl !h-[90vh] !p-0 !flex !flex-col !gap-0">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Edit Role Limits: {editingLimits.display_name}
          </DialogTitle>
          <DialogDescription>
            Configure access limits and permissions for this role
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
          <div className="space-y-6 pb-4">
            {/* Numeric Limits */}
            <NumericLimitsSection
              limits={editingLimits}
              onUpdate={onUpdateLimits}
            />

            {/* Schedule Resolution */}
            <div className="space-y-2">
              <Label>Schedule Resolution</Label>
              <div className="flex gap-4">
                {SCHEDULE_RESOLUTIONS.map((resolution) => {
                  const resolutions = editingLimits.schedule_resolution?.split(',') || [];
                  const isChecked = resolutions.includes(resolution);
                  return (
                    <div key={resolution} className="flex items-center space-x-2">
                      <Checkbox
                        id={`resolution-${resolution}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => handleResolutionToggle(resolution, checked)}
                      />
                      <Label htmlFor={`resolution-${resolution}`}>{resolution}</Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Select which schedule intervals this role can access
              </p>
            </div>

            {/* Optimization Mode */}
            <div className="space-y-2">
              <Label>Optimization Mode</Label>
              <div className="flex gap-4">
                {OPTIMIZATION_MODES.map((mode) => {
                  const modes = editingLimits.optimization_mode?.split(',') || [];
                  const isChecked = modes.includes(mode);
                  return (
                    <div key={mode} className="flex items-center space-x-2">
                      <Checkbox
                        id={`mode-${mode}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => handleModeToggle(mode, checked)}
                      />
                      <Label htmlFor={`mode-${mode}`} className="capitalize">{mode}</Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Available optimization modes for analysis. Speed prioritizes faster results, Balanced provides more comprehensive analysis.
              </p>
            </div>

            {/* Boolean Flags */}
            <AccessFlagsSection
              limits={editingLimits}
              onUpdate={onUpdateLimits}
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