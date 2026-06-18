"use client";

import { useAnalysisStore } from "@/stores/analysis-store";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";

export function StatusBar() {
  const status = useAnalysisStore((s) => s.status);
  const currentStage = useAnalysisStore((s) => s.currentStage);
  const functions = useAnalysisStore((s) => s.functions);
  const results = useAnalysisStore((s) => s.results);
  const error = useAnalysisStore((s) => s.error);
  const filename = useEditorStore((s) => s.filename);
  const jobId = useEditorStore((s) => s.jobId);

  const analyzing = functions.filter((f) => f.status === "analyzing").length;
  const fixed = functions.filter((f) => f.status === "fixed").length;
  const clean = functions.filter((f) => f.status === "clean").length;
  const errored = functions.filter((f) => f.status === "error").length;
  const totalVulns = results.flatMap((r) => r.vulnerabilities).length;

  const stageLabel = currentStage ? (STAGE_LABELS[currentStage] ?? currentStage) : null;

  return (
    <div className="flex h-5 shrink-0 items-center justify-between border-t border-border bg-muted/30 px-3">
      {/* Left: status */}
      <div className="flex items-center gap-3">
        {status === "idle" && (
          <span className="text-[10px] text-muted-foreground/50">
            {filename ? "Ready to analyze" : "No file loaded"}
          </span>
        )}

        {status === "analyzing" && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[10px] text-primary">
                Analyzing
                {stageLabel ? ` — ${stageLabel}` : "…"}
              </span>
            </div>
            {analyzing > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {analyzing} function{analyzing !== 1 ? "s" : ""} in progress
              </span>
            )}
          </>
        )}

        {status === "complete" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] text-green-400">Analysis complete</span>
            </div>
            {totalVulns > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {totalVulns} vulnerabilit{totalVulns !== 1 ? "ies" : "y"} •{" "}
                {fixed} fixed • {clean} clean
                {errored > 0 && ` • ${errored} errored`}
              </span>
            )}
            {totalVulns === 0 && (
              <span className="text-[10px] text-muted-foreground">
                No vulnerabilities found
              </span>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
            <span className="text-[10px] text-destructive">
              {error ? `Error: ${error.slice(0, 80)}${error.length > 80 ? "…" : ""}` : "Analysis failed"}
            </span>
          </div>
        )}
      </div>

      {/* Right: identifiers */}
      <div className="flex items-center gap-3">
        {functions.length > 0 && (
          <span className={cn("text-[10px] text-muted-foreground/60")}>
            {functions.length} fn
          </span>
        )}
        {jobId && (
          <span className="font-mono text-[10px] text-muted-foreground/40">
            {jobId.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}
