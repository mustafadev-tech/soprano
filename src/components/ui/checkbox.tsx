"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

function Checkbox({
  className,
  checked,
  ...props
}: CheckboxPrimitive.Root.Props) {
  const isChecked = checked === true

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-input bg-background transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isChecked && "border-foreground bg-foreground",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      checked={checked}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn(
        "flex items-center justify-center text-background",
        !isChecked && "opacity-0"
      )}>
        <Check strokeWidth={3} size={11} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
