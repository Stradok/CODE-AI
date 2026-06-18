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
    <div className="flex h-6 shrink-0 items-center justify-between bg-[#E0E5EC] px-3 shadow-[0_-2px_4px_rgb(163,177,198,0.15)]">
      {/* Left: status */}
      <div className="flex items-center gap-3">
        {status === "idle" && (
          <span className="text-[10px] text-[#6B7280]/50">
            {filename ? "Ready to analyze" : "No file loaded"}
          </span>
        )}

        {status === "analyzing" && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[#6C63FF]" />
              <span className="text-[10px] text-[#6C63FF]">
                Analyzing
                {stageLabel ? ` — ${stageLabel}` : "…"}
              </span>
            </div>
            {analyzing > 0 && (
              <span className="text-[10px] text-[#6B7280]">
                {analyzing} function{analyzing !== 1 ? "s" : ""} in progress
              </span>
            )}
          </>
        )}

        {status === "complete" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#38A169]" />
              <span className="text-[10px] text-[#38A169]">Analysis complete</span>
            </div>
            {totalVulns > 0 && (
              <span className="text-[10px] text-[#6B7280]">
                {totalVulns} vulnerabilit{totalVulns !== 1 ? "ies" : "y"} •{" "}
                {fixed} fixed • {clean} clean
                {errored > 0 && ` • ${errored} errored`}
              </span>
            )}
            {totalVulns === 0 && (
              <span className="text-[10px] text-[#6B7280]">
                No vulnerabilities found
              </span>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
            <span className="text-[10px] text-[#DC2626]">
              {error ? `Error: ${error.slice(0, 80)}${error.length > 80 ? "…" : ""}` : "Analysis failed"}
            </span>
          </div>
        )}
      </div>

      {/* Right: identifiers */}
      <div className="flex items-center gap-3">
        {functions.length > 0 && (
          <span className="text-[10px] text-[#6B7280]/60">
            {functions.length} fn
          </span>
        )}
        {jobId && (
          <span className="font-mono text-[10px] text-[#6B7280]/40">
            {jobId.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}
