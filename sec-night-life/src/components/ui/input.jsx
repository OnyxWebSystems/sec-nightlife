import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex w-full h-10 rounded-[6px] border border-[#24242A] bg-[#18181C] px-3 py-2",
        // Use 16px to prevent iOS Safari input auto-zoom
        "text-[16px] text-[#F0F0F4] placeholder:text-[#505060]",
        "font-[DM_Sans,sans-serif]",
        "outline-none transition-colors duration-150",
        "focus:border-[#C8C8D0]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
