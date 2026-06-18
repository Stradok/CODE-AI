"use client";

import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useAnalysisStore } from "@/stores/analysis-store";

export function ReportSummary() {
  const results = useAnalysisStore((s) => s.results);
  const status = useAnalysisStore((s) => s.status);

  if (status !== "complete" || results.length === 0) return null;

  const allVulns = results.flatMap((r) => r.vulnerabilities);
  const totalVulns = allVulns.length;
  const fixed = allVulns.filter((v) => v.verdict === "FIX_SUCCESSFUL").length;
  const partial = allVulns.filter((v) => v.verdict === "PARTIALLY_FIXED").length;
  const failed = allVulns.filter((v) => v.verdict === "FIX_FAILED").length;

  const bySeverity = {
    Critical: allVulns.filter((v) => v.exploitability === "Critical").length,
    High: allVulns.filter((v) => v.exploitability === "High").length,
    Medium: allVulns.filter((v) => v.exploitability === "Medium").length,
    Low: allVulns.filter((v) => v.exploitability === "Low").length,
  };

  const cleanFunctions = results.filter((r) => r.vulnerabilities.length === 0).length;
  const scorePercent = totalVulns > 0 ? Math.round((fixed / totalVulns) * 100) : 100;

  return (
    <div className="p-4">
      {/* Score ring */}
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-border/50 bg-muted/20 p-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32" cy="32" r="27"
              fill="none"
              strokeWidth="6"
              className="stroke-border/40"
            />
            <circle
              cx="32" cy="32" r="27"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 27}`}
              strokeDashoffset={`${2 * Math.PI * 27 * (1 - scorePercent / 100)}`}
              className="stroke-primary transition-all duration-700"
            />
          </svg>
          <span className="text-lg font-bold text-foreground">{scorePercent}%</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Fix Rate</p>
          <p className="text-xs text-muted-foreground">
            {fixed} of {totalVulns} vulnerabilit{totalVulns !== 1 ? "ies" : "y"} resolved
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            {results.length} functions analyzed · {cleanFunctions} clean
          </p>
        </div>
      </div>

      {/* Fix outcome grid */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          value={fixed}
          label="Fixed"
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4 text-yellow-400" />}
          value={partial}
          label="Partial"
        />
        <MetricCard
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          value={failed}
          label="Failed"
        />
      </div>

      {/* Severity breakdown */}
      {totalVulns > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            By Severity
          </p>
          <div className="flex flex-col gap-1.5">
            {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
              const count = bySeverity[sev];
              if (count === 0) return null;
              const pct = Math.round((count / totalVulns) * 100);
              const barColors: Record<string, string> = {
                Critical: "bg-red-500",
                High: "bg-orange-500",
                Medium: "bg-yellow-500",
                Low: "bg-green-500",
              };
              return (
                <div key={sev} className="flex items-center gap-2">
                  <span className="w-12 text-[10px] text-muted-foreground">{sev}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted/40 h-1.5">
                    <div
                      className={`h-full rounded-full ${barColors[sev]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-4 text-right text-[10px] text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalVulns === 0 && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <ShieldCheck className="h-10 w-10 text-green-400/60" />
          <p className="text-sm font-medium text-green-400">No vulnerabilities found</p>
          <p className="text-xs text-muted-foreground">All analyzed functions are clean</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-muted/10 py-2.5">
      {icon}
      <span className="text-lg font-bold text-foreground leading-none">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
