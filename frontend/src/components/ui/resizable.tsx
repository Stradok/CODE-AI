"use client"

import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-2 items-center justify-center bg-[#E0E5EC] after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-[#B0BEC5]/30 focus-visible:ring-1 focus-visible:ring-[#6C63FF] focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-0.5 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-8 w-1 shrink-0 rounded-full bg-[#B0BEC5]/40 shadow-[inset_2px_2px_4px_rgb(163,177,198,0.4),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
