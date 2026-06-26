export interface UploadResponse {
  job_id: string;
  filename: string;
  code: string;
}

export interface HealthResponse {
  status: string;
  ollama: boolean;
  backend?: string;
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

export interface StageKeyConfig {
  model: string;
  api_key: string;
  provider: string;
}

export interface AnalyzeRequest {
  code: string;
  description?: string;
  pdf: boolean;
  models?: Partial<Record<PipelineStage, string>>;
  backend?: string;
  openrouter_api_key?: string;
  stage_configs?: Partial<Record<PipelineStage, StageKeyConfig>>;
}

export interface ScanRepoRequest {
  repo_url: string;
  github_token?: string;
  max_files?: number;
  backend?: string;
  openrouter_api_key?: string;
  stage_configs?: Partial<Record<PipelineStage, StageKeyConfig>>;
}
