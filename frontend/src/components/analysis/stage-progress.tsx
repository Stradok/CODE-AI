"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StageProgress() {
  const status = useAnalysisStore((s) => s.status);
  const currentStage = useAnalysisStore((s) => s.currentStage);

  if (status === "idle") return null;

  const currentIdx = currentStage
    ? PIPELINE_STAGES.indexOf(currentStage as (typeof PIPELINE_STAGES)[number])
    : -1;

  const isComplete = status === "complete";

  return (
    <div className="shrink-0 border-b border-border bg-muted/10 px-3 py-2">
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {PIPELINE_STAGES.map((stage, idx) => {
          const done = isComplete || (currentIdx >= 0 && idx < currentIdx);
          const active = idx === currentIdx && status === "analyzing";
          const pending = !done && !active;

          return (
            <div key={stage} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    "mx-1 h-px w-4 shrink-0 transition-colors duration-300",
                    done ? "bg-primary/60" : "bg-border/50"
                  )}
                />
              )}
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-border/60" />
                )}
                <span
                  className={cn(
                    "text-[9px] whitespace-nowrap font-medium transition-colors",
                    done && "text-primary/70",
                    active && "text-primary",
                    pending && "text-muted-foreground/40"
                  )}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
