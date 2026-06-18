"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnalysisStore } from "@/stores/analysis-store";
import { FunctionResult } from "./function-result";

export function ResultsPanel() {
  const results = useAnalysisStore((s) => s.results);
  const status = useAnalysisStore((s) => s.status);

  if (status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center bg-[#E0E5EC]">
        <ShieldCheck className="h-8 w-8 text-[#6B7280]/20" />
        <p className="text-sm text-[#6B7280]">Results will appear here after analysis</p>
      </div>
    );
  }

  if (status === "analyzing" && results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center bg-[#E0E5EC]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6C63FF]/50" />
        <p className="text-sm text-[#6B7280]">
          Analysis in progress — results appear as each function completes
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center bg-[#E0E5EC]">
        <ShieldCheck className="h-10 w-10 text-[#38A169]/50" />
        <p className="text-sm font-medium text-[#38A169]">All functions are clean</p>
        <p className="text-xs text-[#6B7280]">No vulnerabilities were detected</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {results.map((result, i) => (
          <FunctionResult key={`${result.function_name}-${i}`} result={result} />
        ))}
      </div>
    </ScrollArea>
  );
}
