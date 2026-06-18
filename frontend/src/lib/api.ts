import type { UploadResponse, HealthResponse, ModelsResponse } from "@/types/api";

const API_BASE = "/api";

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  return res.json();
}

export async function getAvailableModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  return res.json();
}

export function getReportUrl(jobId: string): string {
  return `${API_BASE}/report/${jobId}`;
}

export function getPdfReportUrl(jobId: string): string {
  return `${API_BASE}/report/${jobId}/pdf`;
}
