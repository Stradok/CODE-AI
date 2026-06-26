export type SSEEventType =
  | "connected"
  | "stage_start"
  | "description_generated"
  | "preprocessing_complete"
  | "function_start"
  | "rag_complete"
  | "validation_complete"
  | "risk_complete"
  | "fix_attempt"
  | "fix_result"
  | "function_clean"
  | "report_written"
  | "pdf_generated"
  | "pipeline_complete"
  | "error"
  // GitHub repo scan events
  | "repo_start"
  | "repo_files"
  | "repo_file_start"
  | "repo_file_done"
  | "repo_file_error"
  | "repo_complete";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface FunctionInfo {
  name: string;
  status: "pending" | "analyzing" | "clean" | "vulnerable" | "fixed" | "error";
  description?: string;
  cveCount?: number;
}
