import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface AlpacaRedirectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AlpacaRedirectModal({ isOpen, onClose }: AlpacaRedirectModalProps) {
  const { apiSettings } = useAuth();
  const isPaperTrading = apiSettings?.alpaca_paper_trading ?? true;

  const alpacaUrl = isPaperTrading
    ? "https://app.alpaca.markets/paper/dashboard/overview"
    : "https://app.alpaca.markets/live/dashboard/overview";

  const handleOpenAlpaca = () => {
    window.open(alpacaUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Manual Trading on Alpaca
          </DialogTitle>
          <DialogDescription>
            To place manual trades, please use the Alpaca trading platform directly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            You will be redirected to your {isPaperTrading ? "paper" : "live"} trading dashboard
            where you can:
          </p>
          <ul className="text-sm space-y-1 ml-4 text-muted-foreground">
            <li>• Place market and limit orders</li>
            <li>• View real-time market data</li>
            <li>• Manage your positions</li>
            <li>• Monitor your portfolio performance</li>
          </ul>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleOpenAlpaca} className="gap-2">
            Open Alpaca
            <ExternalLink className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}