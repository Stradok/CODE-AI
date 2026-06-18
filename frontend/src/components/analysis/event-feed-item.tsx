"use client";

import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  ShieldCheck,
  Bug,
  Wrench,
  FileText,
} from "lucide-react";
import type { SSEEvent, SSEEventType } from "@/types/events";
import { EVENT_DESCRIPTIONS } from "@/lib/constants";

const EVENT_ICONS: Record<SSEEventType, React.ReactNode> = {
  connected: <Info className="h-3.5 w-3.5 text-blue-400" />,
  stage_start: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
  description_generated: <FileText className="h-3.5 w-3.5 text-cyan-400" />,
  preprocessing_complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  function_start: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
  rag_complete: <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />,
  validation_complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  risk_complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  fix_attempt: <Wrench className="h-3.5 w-3.5 text-yellow-400 animate-spin" />,
  fix_result: <Wrench className="h-3.5 w-3.5 text-green-400" />,
  function_clean: <ShieldCheck className="h-3.5 w-3.5 text-green-400" />,
  report_written: <FileText className="h-3.5 w-3.5 text-blue-400" />,
  pdf_generated: <FileText className="h-3.5 w-3.5 text-blue-400" />,
  pipeline_complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventDetail(event: SSEEvent): string {
  const base = EVENT_DESCRIPTIONS[event.type] ?? event.type;
  const d = event.data;

  switch (event.type) {
    case "stage_start":
      return `Starting: ${d.stage}`;
    case "description_generated":
      return `${d.function}: description ready`;
    case "preprocessing_complete":
      return `Found ${(d.functions as string[])?.length ?? 0} functions`;
    case "function_start":
      return `Analyzing: ${d.function}`;
    case "rag_complete": {
      const count = (d.detected_cves as unknown[])?.length ?? 0;
      return `${d.function}: ${count} potential CVE${count !== 1 ? "s" : ""} detected`;
    }
    case "validation_complete":
      return `${d.function}: validation done`;
    case "risk_complete":
      return `${d.function}: risk scored`;
    case "fix_attempt":
      return `${d.function}: fix attempt #${d.attempt ?? "?"}`;
    case "fix_result":
      return `${d.function}: ${d.verdict}`;
    case "function_clean":
      return `${d.function}: no vulnerabilities`;
    case "report_written":
      return `${d.function}: report written`;
    case "error": {
      const func = d.function as string | undefined;
      return func
        ? `${func}: ${d.message} (continuing...)`
        : `Error: ${d.message}`;
    }
    default:
      return base;
  }
}

interface EventFeedItemProps {
  event: SSEEvent;
}

export function EventFeedItem({ event }: EventFeedItemProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-1 hover:bg-muted/30">
      <span className="mt-0.5 shrink-0">
        {EVENT_ICONS[event.type] ?? <Info className="h-3.5 w-3.5" />}
      </span>
      <span className="flex-1 text-xs text-foreground/80">
        {getEventDetail(event)}
      </span>
      <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
        {formatTime(event.timestamp)}
      </span>
    </div>
  );
}
