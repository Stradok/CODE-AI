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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <ShieldCheck className="h-8 w-8 text-muted-foreground/20" />
        <p className="text-sm">Results will appear here after analysis</p>
      </div>
    );
  }

  if (status === "analyzing" && results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        <p className="text-sm text-muted-foreground">
          Analysis in progress — results appear as each function completes
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <ShieldCheck className="h-10 w-10 text-green-400/50" />
        <p className="text-sm font-medium text-green-400">All functions are clean</p>
        <p className="text-xs text-muted-foreground">No vulnerabilities were detected</p>
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
