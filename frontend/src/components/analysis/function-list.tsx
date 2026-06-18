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
    icon: <ShieldCheck className="h-3 w-3 text-muted-foreground/30" />,
    pill: "border-border/40 bg-transparent text-muted-foreground/40",
  },
  analyzing: {
    icon: <Loader2 className="h-3 w-3 animate-spin text-primary" />,
    pill: "border-primary/30 bg-primary/10 text-primary",
  },
  clean: {
    icon: <CheckCircle2 className="h-3 w-3 text-green-400" />,
    pill: "border-green-500/25 bg-green-500/8 text-green-400",
  },
  vulnerable: {
    icon: <ShieldAlert className="h-3 w-3 text-red-400" />,
    pill: "border-red-500/25 bg-red-500/8 text-red-400",
  },
  fixed: {
    icon: <CheckCircle2 className="h-3 w-3 text-primary" />,
    pill: "border-primary/25 bg-primary/8 text-primary",
  },
  error: {
    icon: <AlertCircle className="h-3 w-3 text-orange-400" />,
    pill: "border-orange-500/25 bg-orange-500/8 text-orange-400",
  },
};

export function FunctionList() {
  const functions = useAnalysisStore((s) => s.functions);

  if (functions.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border bg-muted/5 px-3 py-2">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40">
        Functions · {functions.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {functions.map((fn) => {
          const cfg = STATUS_CONFIG[fn.status];
          return (
            <Tooltip key={fn.name}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex cursor-default items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all",
                    cfg.pill
                  )}
                >
                  {cfg.icon}
                  <span className="font-mono">{fn.name}</span>
                  {fn.cveCount !== undefined && fn.cveCount > 0 && (
                    <span className="rounded-full bg-red-500/20 px-1 text-[9px] text-red-400">
                      {fn.cveCount}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-mono text-xs font-medium">{fn.name}()</p>
                {fn.description && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{fn.description}</p>
                )}
                {!fn.description && (
                  <p className="mt-1 text-[11px] text-muted-foreground capitalize">{fn.status}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
