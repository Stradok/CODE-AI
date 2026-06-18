export interface UploadResponse {
  job_id: string;
  filename: string;
  code: string;
}

export interface HealthResponse {
  status: string;
  ollama: boolean;
}

export interface AnalyzeRequest {
  code: string;
  description?: string;
  pdf: boolean;
}
