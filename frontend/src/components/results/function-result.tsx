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
    <ShieldCheck className="h-4 w-4 text-green-400" />
  ) : allFixed ? (
    <ShieldCheck className="h-4 w-4 text-primary" />
  ) : someFixed ? (
    <AlertCircle className="h-4 w-4 text-yellow-400" />
  ) : (
    <ShieldAlert className="h-4 w-4 text-red-400" />
  );

  const statusLabel = !hasVulns
    ? "Clean"
    : allFixed
    ? `${vulnCount} fixed`
    : someFixed
    ? `${vulnCount} vuln${vulnCount !== 1 ? "s" : ""} — partial fix`
    : `${vulnCount} unfixed vuln${vulnCount !== 1 ? "s" : ""}`;

  const statusColor = !hasVulns
    ? "text-green-400"
    : allFixed
    ? "text-primary"
    : someFixed
    ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="border-b border-border/50 last:border-0">
      {/* Function header */}
      <button
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        )}
        {icon}
        <span className="flex-1 font-mono text-sm font-medium text-foreground">
          {result.function_name}
          <span className="text-muted-foreground/40">()</span>
        </span>
        <span className={cn("text-[11px] font-medium", statusColor)}>
          {statusLabel}
        </span>
      </button>

      {/* Vulnerability cards */}
      {expanded && hasVulns && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {result.vulnerabilities.map((v, i) => (
            <VulnerabilityCard key={`${v.cve_id}-${i}`} vulnerability={v} />
          ))}

          {/* Audit trail */}
          {result.audit_trail && (
            <div className="mt-1 rounded-md border border-border/40 bg-muted/20 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Audit Trail
              </p>
              <p className="text-[11px] leading-relaxed text-foreground/60 whitespace-pre-wrap">
                {result.audit_trail}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
