import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";

interface PortfolioMetric {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: any;
}

const portfolioMetrics: PortfolioMetric[] = [
  {
    label: "Total Portfolio Value",
    value: "$124,567.89",
    change: "+2.34%",
    isPositive: true,
    icon: DollarSign
  },
  {
    label: "Daily P&L",
    value: "$2,847.12",
    change: "+1.23%",
    isPositive: true,
    icon: TrendingUp
  },
  {
    label: "Sharpe Ratio",
    value: "1.47",
    change: "+0.12",
    isPositive: true,
    icon: Percent
  },
  {
    label: "Max Drawdown",
    value: "-3.2%",
    change: "-0.5%",
    isPositive: false,
    icon: TrendingDown
  }
];

export default function PortfolioOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {portfolioMetrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <Card key={index} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <Icon className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-foreground">{metric.value}</div>
              <p className={`text-xs flex items-center gap-1 mt-1 ${
                metric.isPositive ? 'text-success' : 'text-danger'
              }`}>
                {metric.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {metric.change}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}