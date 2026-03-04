import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[4px] text-[10px] font-semibold tracking-[0.08em] uppercase px-2 py-[3px] border transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[rgba(200,200,208,0.08)] text-[#C8C8D0] border-[rgba(200,200,208,0.18)]",
        gold:
          "bg-[rgba(184,150,62,0.1)] text-[#D4AE58] border-[rgba(184,150,62,0.22)]",
        success:
          "bg-[rgba(82,183,136,0.08)] text-[#52B788] border-[rgba(82,183,136,0.18)]",
        danger:
          "bg-[rgba(252,129,129,0.07)] text-[#FC8181] border-[rgba(252,129,129,0.18)]",
        muted:
          "bg-[rgba(80,80,96,0.2)] text-[#8888A0] border-[rgba(80,80,96,0.25)]",
        outline:
          "bg-transparent text-[#8888A0] border-[#24242A]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
