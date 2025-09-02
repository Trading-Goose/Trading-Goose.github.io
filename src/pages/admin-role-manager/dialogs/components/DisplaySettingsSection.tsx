import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExtendedRoleData } from "../../types";

interface DisplaySettingsSectionProps {
  extendedData: ExtendedRoleData;
  onUpdate: (data: ExtendedRoleData) => void;
}

export default function DisplaySettingsSection({
  extendedData,
  onUpdate
}: DisplaySettingsSectionProps) {
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold mb-3">Display Settings</h3>
      <div className="space-y-4">
        <div>
          <Label>Color (Hex Code)</Label>
          <div className="flex gap-2 items-center">
            <Input
              value={extendedData.color}
              onChange={(e) => onUpdate({
                ...extendedData,
                color: e.target.value
              })}
              placeholder="e.g., #FF5733"
              className="flex-1"
            />
            <div
              className="w-10 h-10 rounded border"
              style={{ backgroundColor: extendedData.color || '#6B7280' }}
              title="Color preview"
            />
          </div>
        </div>
        <div>
          <Label>Icon URL</Label>
          <Input
            value={extendedData.icon_url}
            onChange={(e) => onUpdate({
              ...extendedData,
              icon_url: e.target.value
            })}
            placeholder="e.g., https://example.com/icons/crown.svg"
          />
        </div>
      </div>
    </div>
  );
}