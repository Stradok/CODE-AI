"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "#E0E5EC",
          "--normal-text": "#3D4852",
          "--normal-border": "transparent",
          "--border-radius": "16px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-[9px_9px_16px_rgb(163,177,198,0.6),-9px_-9px_16px_rgba(255,255,255,0.5)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
