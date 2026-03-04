import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-[#18181C]", className)}
      {...props}
    />
  )
}

export { Skeleton }
