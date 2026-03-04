import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-[13px] font-semibold tracking-[0.02em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#F0F0F4] text-[#0B0B0F] hover:bg-[#E0E0E8] active:scale-[0.99] border border-transparent",
        destructive:
          "bg-transparent text-[#FC8181] border border-[#FC8181]/30 hover:bg-[#FC8181]/10",
        outline:
          "bg-transparent text-[#8888A0] border border-[#24242A] hover:text-[#F0F0F4] hover:bg-[#18181C] hover:border-[#36363E]",
        secondary:
          "bg-[#18181C] text-[#C8C8D0] border border-[#24242A] hover:bg-[#1E1E24] hover:border-[#36363E]",
        ghost:
          "bg-transparent text-[#8888A0] border border-transparent hover:text-[#C8C8D0] hover:bg-[#18181C]",
        link:
          "text-[#C8C8D0] underline-offset-4 hover:underline bg-transparent border-transparent p-0 h-auto",
        gold:
          "bg-[#B8963E] text-[#0B0B0F] border border-transparent hover:bg-[#D4AE58] active:scale-[0.99]",
      },
      size: {
        default: "h-10 px-5 py-0",
        sm: "h-8 px-4 text-[12px]",
        lg: "h-12 px-7 text-[14px]",
        xl: "h-14 px-10 text-[15px]",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
