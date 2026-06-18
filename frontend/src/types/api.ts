export interface UploadResponse {
  job_id: string;
  filename: string;
  code: string;
}

export interface HealthResponse {
  status: string;
  ollama: boolean;
}

export interface OllamaModel {
  name: string;
}

export interface ModelsResponse {
  models: string[];
}

export type PipelineStage =
  | "preprocessing"
  | "rag_analyzer"
  | "validator"
  | "recommender"
  | "reporter";

export interface AnalyzeRequest {
  code: string;
  description?: string;
  pdf: boolean;
  models?: Partial<Record<PipelineStage, string>>;
}
