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
    <div className="p-4 bg-[#E0E5EC]">
      {/* Score card */}
      <div className="mb-4 flex items-center gap-4 rounded-[28px] bg-[#E0E5EC] p-5 shadow-[9px_9px_16px_rgb(163,177,198,0.6),-9px_-9px_16px_rgba(255,255,255,0.5)]">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r="33"
              fill="none"
              strokeWidth="6"
              stroke="#D1D9E6"
            />
            <circle
              cx="40" cy="40" r="33"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              stroke="#6C63FF"
              strokeDasharray={`${2 * Math.PI * 33}`}
              strokeDashoffset={`${2 * Math.PI * 33 * (1 - scorePercent / 100)}`}
              className="transition-all duration-700"
            />
          </svg>
          <span className="text-xl font-bold text-[#3D4852]">{scorePercent}%</span>
        </div>
        <div>
          <p className="text-base font-bold tracking-tight text-[#3D4852]">Fix Rate</p>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {fixed} of {totalVulns} vulnerabilit{totalVulns !== 1 ? "ies" : "y"} resolved
          </p>
          <p className="text-[10px] text-[#6B7280]/60 mt-1">
            {results.length} functions analyzed · {cleanFunctions} clean
          </p>
        </div>
      </div>

      {/* Fix outcome grid */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4 text-[#6C63FF]" />}
          value={fixed}
          label="Fixed"
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4 text-[#D69E2E]" />}
          value={partial}
          label="Partial"
        />
        <MetricCard
          icon={<XCircle className="h-4 w-4 text-[#DC2626]" />}
          value={failed}
          label="Failed"
        />
      </div>

      {/* Severity breakdown */}
      {totalVulns > 0 && (
        <div className="rounded-[28px] bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgb(163,177,198,0.6),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]/60">
            By Severity
          </p>
          <div className="flex flex-col gap-2">
            {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
              const count = bySeverity[sev];
              if (count === 0) return null;
              const pct = Math.round((count / totalVulns) * 100);
              const barColors: Record<string, string> = {
                Critical: "bg-[#DC2626]",
                High: "bg-[#ED8936]",
                Medium: "bg-[#D69E2E]",
                Low: "bg-[#38A169]",
              };
              return (
                <div key={sev} className="flex items-center gap-2">
                  <span className="w-12 text-[10px] text-[#6B7280]">{sev}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-[#D1D9E6] h-2 shadow-[inset_2px_2px_4px_rgb(163,177,198,0.4),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]">
                    <div
                      className={`h-full rounded-full ${barColors[sev]} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-4 text-right text-[10px] text-[#6B7280]">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalVulns === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ShieldCheck className="h-10 w-10 text-[#38A169]/60" />
          <p className="text-sm font-medium text-[#38A169]">No vulnerabilities found</p>
          <p className="text-xs text-[#6B7280]">All analyzed functions are clean</p>
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
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#E0E5EC] py-3 shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]">
      {icon}
      <span className="text-lg font-bold text-[#3D4852] leading-none">{value}</span>
      <span className="text-[10px] text-[#6B7280] font-medium">{label}</span>
    </div>
  );
}
