"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 bg-[#E0E5EC]">
      <div className="flex h-16 w-16 items-center justify-center rounded-[32px] bg-[#E0E5EC] shadow-[inset_6px_6px_10px_rgb(163,177,198,0.6),inset_-6px_-6px_10px_rgba(255,255,255,0.5)]">
        <AlertCircle className="h-8 w-8 text-[#DC2626]" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-bold tracking-tight text-[#3D4852]">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          {error.message || "An unexpected error occurred"}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
