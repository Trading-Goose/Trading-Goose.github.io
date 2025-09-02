import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExtendedRoleData } from "../../types";

interface PricingSectionProps {
  extendedData: ExtendedRoleData;
  onUpdate: (data: ExtendedRoleData) => void;
}

export default function PricingSection({
  extendedData,
  onUpdate
}: PricingSectionProps) {
  const hasYearlyDiscount = extendedData.price_monthly && 
    extendedData.price_yearly && 
    extendedData.price_monthly > 0 && 
    extendedData.price_yearly > 0;

  const yearlyDiscount = hasYearlyDiscount
    ? Math.round((1 - (extendedData.price_yearly! / 12) / extendedData.price_monthly!) * 100)
    : 0;

  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold mb-3">Pricing</h3>
      <div className="space-y-4">
        <div>
          <Label>Monthly Price (USD)</Label>
          <Input
            type="number"
            step="0.01"
            value={extendedData.price_monthly ?? ''}
            onChange={(e) => onUpdate({
              ...extendedData,
              price_monthly: e.target.value === '' ? null : parseFloat(e.target.value)
            })}
            placeholder="e.g., 29.99 or 0.00 for free"
          />
        </div>
        <div>
          <Label>Yearly Price (USD)</Label>
          <Input
            type="number"
            step="0.01"
            value={extendedData.price_yearly ?? ''}
            onChange={(e) => onUpdate({
              ...extendedData,
              price_yearly: e.target.value === '' ? null : parseFloat(e.target.value)
            })}
            placeholder="e.g., 299.99 or 0.00 for free"
          />
          {hasYearlyDiscount && (
            <p className="text-sm text-muted-foreground mt-1">
              Yearly discount: {yearlyDiscount}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}