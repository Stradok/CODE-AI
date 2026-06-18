import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[#E0E5EC] text-[#3D4852] shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]",
        secondary:
          "bg-[#D1D9E6] text-[#3D4852] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
        destructive:
          "bg-[#DC2626] text-white",
        outline:
          "bg-[#E0E5EC] text-[#3D4852] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
        ghost:
          "bg-transparent text-[#6B7280] hover:text-[#3D4852]",
        link: "text-[#6C63FF] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
