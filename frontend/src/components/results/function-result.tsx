"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { VulnerabilityCard } from "./vulnerability-card";
import type { FunctionResult as FunctionResultType } from "@/types/report";
import { cn } from "@/lib/utils";

interface FunctionResultProps {
  result: FunctionResultType;
}

export function FunctionResult({ result }: FunctionResultProps) {
  const [expanded, setExpanded] = useState(true);
  const vulnCount = result.vulnerabilities.length;
  const hasVulns = vulnCount > 0;
  const allFixed = hasVulns && result.vulnerabilities.every((v) => v.verdict === "FIX_SUCCESSFUL");
  const someFixed = hasVulns && result.vulnerabilities.some((v) => v.verdict === "FIX_SUCCESSFUL");

  const icon = !hasVulns ? (
    <ShieldCheck className="h-4 w-4 text-[#38A169]" />
  ) : allFixed ? (
    <ShieldCheck className="h-4 w-4 text-[#6C63FF]" />
  ) : someFixed ? (
    <AlertCircle className="h-4 w-4 text-[#D69E2E]" />
  ) : (
    <ShieldAlert className="h-4 w-4 text-[#DC2626]" />
  );

  const statusLabel = !hasVulns
    ? "Clean"
    : allFixed
    ? `${vulnCount} fixed`
    : someFixed
    ? `${vulnCount} vuln${vulnCount !== 1 ? "s" : ""} — partial fix`
    : `${vulnCount} unfixed vuln${vulnCount !== 1 ? "s" : ""}`;

  const statusColor = !hasVulns
    ? "text-[#38A169]"
    : allFixed
    ? "text-[#6C63FF]"
    : someFixed
    ? "text-[#D69E2E]"
    : "text-[#DC2626]";

  return (
    <div className="bg-[#E0E5EC] last:border-0">
      {/* Function header */}
      <button
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-all duration-300 bg-[#E0E5EC]",
          "shadow-[inset_0_-2px_4px_rgb(163,177,198,0.1)] hover:bg-[#D1D9E6]/20"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#6B7280]/50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#6B7280]/50" />
        )}
        {icon}
        <span className="flex-1 font-mono text-sm font-medium text-[#3D4852]">
          {result.function_name}
          <span className="text-[#6B7280]/40">()</span>
        </span>
        <span className={cn("text-[11px] font-medium", statusColor)}>
          {statusLabel}
        </span>
      </button>

      {/* Vulnerability cards */}
      {expanded && hasVulns && (
        <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
          {result.vulnerabilities.map((v, i) => (
            <VulnerabilityCard key={`${v.cve_id}-${i}`} vulnerability={v} />
          ))}

          {/* Audit trail */}
          {result.audit_trail && (
            <div className="mt-1 rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgb(163,177,198,0.6),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]/60">
                Audit Trail
              </p>
              <p className="text-[11px] leading-relaxed text-[#3D4852]/60 whitespace-pre-wrap">
                {result.audit_trail}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
