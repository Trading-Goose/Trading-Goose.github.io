import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20",
        secondary:
          "border-secondary/20 bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-red-600 text-white hover:bg-red-700",
        outline: "text-foreground border-border hover:bg-accent hover:text-accent-foreground",
        success:
          "border-transparent bg-green-600 text-white hover:bg-green-700",
        warning:
          "border-transparent bg-yellow-600 text-white hover:bg-yellow-700",
        premium:
          "border-primary/30 bg-gradient-to-r from-primary/20 to-accent/20 text-primary hover:from-primary/30 hover:to-accent/30",
        // Trading action badges with unified styling
        buy:
          "border border-green-500/30 bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20",
        sell:
          "border border-red-500/30 bg-red-500/10 text-red-600 font-semibold hover:bg-red-500/20",
        hold:
          "border border-gray-500/30 bg-gray-500/10 text-gray-600 font-semibold hover:bg-gray-500/20",
        // Workflow status badges
        completed:
          "border border-green-500/30 bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20",
        running:
          "border border-yellow-500/30 bg-yellow-500/10 text-yellow-600 font-semibold hover:bg-yellow-500/20",
        error:
          "border border-red-500/30 bg-red-500/10 text-red-600 font-semibold hover:bg-red-500/20",
        pending:
          "border border-gray-500/30 bg-gray-500/10 text-gray-600 font-semibold hover:bg-gray-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
