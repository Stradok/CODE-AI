"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FunctionInfo } from "@/types/events";

const STATUS_CONFIG: Record<
  FunctionInfo["status"],
  { icon: React.ReactNode; pill: string }
> = {
  pending: {
    icon: <ShieldCheck className="h-3 w-3 text-[#6B7280]/30" />,
    pill: "bg-[#E0E5EC] text-[#6B7280]/40",
  },
  analyzing: {
    icon: <Loader2 className="h-3 w-3 animate-spin text-[#6C63FF]" />,
    pill: "bg-[#E0E5EC] text-[#6C63FF] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
  },
  clean: {
    icon: <CheckCircle2 className="h-3 w-3 text-[#38A169]" />,
    pill: "bg-[#E0E5EC] text-[#38A169] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
  },
  vulnerable: {
    icon: <ShieldAlert className="h-3 w-3 text-[#DC2626]" />,
    pill: "bg-[#E0E5EC] text-[#DC2626] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
  },
  fixed: {
    icon: <CheckCircle2 className="h-3 w-3 text-[#6C63FF]" />,
    pill: "bg-[#E0E5EC] text-[#6C63FF] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
  },
  error: {
    icon: <AlertCircle className="h-3 w-3 text-[#ED8936]" />,
    pill: "bg-[#E0E5EC] text-[#ED8936] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
  },
};

export function FunctionList() {
  const functions = useAnalysisStore((s) => s.functions);

  if (functions.length === 0) return null;

  return (
    <div className="shrink-0 bg-[#E0E5EC] px-3 py-2.5 shadow-[inset_0_-2px_4px_rgb(163,177,198,0.1)]">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-[#6B7280]/40">
        Functions · {functions.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {functions.map((fn) => {
          const cfg = STATUS_CONFIG[fn.status];
          return (
            <Tooltip key={fn.name}>
              <TooltipTrigger
                className={cn(
                  "flex cursor-default items-center gap-1 rounded-full bg-[#E0E5EC] px-2.5 py-0.5 text-[10px] font-medium transition-all duration-300",
                  cfg.pill,
                  fn.status === "pending" && "shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]",
                  fn.status === "analyzing" && "shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]"
                )}
              >
                {cfg.icon}
                <span className="font-mono">{fn.name}</span>
                {fn.cveCount !== undefined && fn.cveCount > 0 && (
                  <span className="rounded-full bg-[#DC2626]/20 px-1 text-[9px] text-[#DC2626]">
                    {fn.cveCount}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-mono text-xs font-medium text-[#3D4852]">{fn.name}()</p>
                {fn.description && (
                  <p className="mt-1 text-[11px] text-[#6B7280]">{fn.description}</p>
                )}
                {!fn.description && (
                  <p className="mt-1 text-[11px] text-[#6B7280] capitalize">{fn.status}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
