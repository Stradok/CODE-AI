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
    <div className="shrink-0 bg-[#E0E5EC] px-3 py-2.5 shadow-[inset_0_-2px_4px_rgb(163,177,198,0.1)]">
      <div className="flex items-center gap-0 overflow-x-auto">
        {PIPELINE_STAGES.map((stage, idx) => {
          const done = isComplete || (currentIdx >= 0 && idx < currentIdx);
          const active = idx === currentIdx && status === "analyzing";
          const pending = !done && !active;

          return (
            <div key={stage} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    "mx-1 h-px w-5 shrink-0 transition-colors duration-300",
                    done ? "bg-[#6C63FF]/60" : "bg-[#B0BEC5]/40"
                  )}
                />
              )}
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-xl transition-all duration-300",
                  done && "bg-[#E0E5EC] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
                  active && "bg-[#E0E5EC] shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]",
                  pending && "bg-[#E0E5EC]"
                )}>
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#6C63FF]" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6C63FF]" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-[#B0BEC5]/60" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[9px] whitespace-nowrap font-medium transition-colors",
                    done && "text-[#6C63FF]",
                    active && "text-[#6C63FF]",
                    pending && "text-[#6B7280]/40"
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
