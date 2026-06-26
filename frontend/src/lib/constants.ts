import type { SSEEventType } from "@/types/events";

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-orange-500 text-white",
  Medium: "bg-yellow-500 text-black",
  Low: "bg-green-600 text-white",
};

export const VERDICT_COLORS: Record<string, string> = {
  FIX_SUCCESSFUL: "bg-green-600 text-white",
  PARTIALLY_FIXED: "bg-yellow-500 text-black",
  FIX_FAILED: "bg-red-600 text-white",
};

export const VERDICT_LABELS: Record<string, string> = {
  FIX_SUCCESSFUL: "Fixed",
  PARTIALLY_FIXED: "Partial Fix",
  FIX_FAILED: "Fix Failed",
};

export const PIPELINE_STAGES = [
  "preprocessing",
  "rag_analysis",
  "validation",
  "risk_scoring",
  "remediation",
  "reporting",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  preprocessing: "Preprocessing",
  rag_analysis: "RAG Analysis",
  validation: "Validation",
  risk_scoring: "Risk Scoring",
  remediation: "Remediation",
  reporting: "Reporting",
};

export const EVENT_DESCRIPTIONS: Record<SSEEventType, string> = {
  connected: "Connected to analysis stream",
  stage_start: "Starting stage",
  description_generated: "Function description generated",
  preprocessing_complete: "Preprocessing complete",
  function_start: "Analyzing function",
  rag_complete: "RAG analysis complete",
  validation_complete: "Validation complete",
  risk_complete: "Risk scoring complete",
  fix_attempt: "Attempting fix",
  fix_result: "Fix result received",
  function_clean: "Function is clean",
  report_written: "Report written",
  pdf_generated: "PDF report generated",
  pipeline_complete: "Analysis complete",
  error: "Error occurred",
  repo_start: "Fetching repository",
  repo_files: "Repository files resolved",
  repo_file_start: "Scanning file",
  repo_file_done: "File scan complete",
  repo_file_error: "File scan error",
  repo_complete: "Repository scan complete",
};
