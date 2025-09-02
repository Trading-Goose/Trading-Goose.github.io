import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { ExtendedRoleData } from "../../types";

interface FeaturesSectionProps {
  extendedData: ExtendedRoleData;
  onUpdate: (data: ExtendedRoleData) => void;
}

export default function FeaturesSection({
  extendedData,
  onUpdate
}: FeaturesSectionProps) {
  const handleAddFeature = () => {
    onUpdate({
      ...extendedData,
      features: [...extendedData.features, '']
    });
  };

  const handleUpdateFeature = (index: number, value: string) => {
    const newFeatures = [...extendedData.features];
    newFeatures[index] = value;
    onUpdate({ ...extendedData, features: newFeatures });
  };

  const handleRemoveFeature = (index: number) => {
    const newFeatures = extendedData.features.filter((_, i) => i !== index);
    onUpdate({ ...extendedData, features: newFeatures });
  };

  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold mb-3">Features</h3>
      <div className="space-y-2">
        {extendedData.features.map((feature, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={feature}
              onChange={(e) => handleUpdateFeature(index, e.target.value)}
              placeholder="Feature description"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRemoveFeature(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddFeature}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Feature
        </Button>
      </div>
    </div>
  );
}