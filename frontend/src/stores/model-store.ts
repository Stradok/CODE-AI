import { create } from "zustand";
import type { PipelineStage } from "@/types/api";

export interface StageConfig {
  key: PipelineStage;
  label: string;
  defaultModel: string;
  defaultOpenRouterModel: string;
}

export const PIPELINE_STAGES: StageConfig[] = [
  { key: "preprocessing",  label: "Preprocessing",  defaultModel: "deepseek-r1:8b",    defaultOpenRouterModel: "deepseek/deepseek-r1-distill-llama-8b:free" },
  { key: "rag_analyzer",   label: "CVE Detection",  defaultModel: "deepseek-r1:8b",    defaultOpenRouterModel: "deepseek/deepseek-r1-distill-llama-8b:free" },
  { key: "validator",      label: "Validation",     defaultModel: "llama3.1:8b",       defaultOpenRouterModel: "meta-llama/llama-3.1-8b-instruct:free"       },
  { key: "recommender",    label: "Fix Generation", defaultModel: "qwen2.5-coder:7b",  defaultOpenRouterModel: "qwen/qwen-2.5-coder-7b-instruct:free"        },
  { key: "reporter",       label: "Reporting",      defaultModel: "mistral:7b",        defaultOpenRouterModel: "mistralai/mistral-7b-instruct:free"           },
];

interface ModelState {
  availableModels: string[];
  selectedModels: Partial<Record<PipelineStage, string>>;
  loadingModels: boolean;

  setAvailableModels: (models: string[]) => void;
  setStageModel: (stage: PipelineStage, model: string) => void;
  resetToDefaults: () => void;
  setLoadingModels: (loading: boolean) => void;

  /** Returns only stages that differ from config.yaml defaults (to send minimal override). */
  getOverrides: () => Partial<Record<PipelineStage, string>>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  availableModels: [],
  selectedModels: {},
  loadingModels: false,

  setAvailableModels: (models) => set({ availableModels: models }),
  setLoadingModels: (loading) => set({ loadingModels: loading }),

  setStageModel: (stage, model) =>
    set((s) => ({ selectedModels: { ...s.selectedModels, [stage]: model } })),

  resetToDefaults: () => set({ selectedModels: {} }),

  getOverrides: () => {
    const { selectedModels } = get();
    const overrides: Partial<Record<PipelineStage, string>> = {};
    for (const stage of PIPELINE_STAGES) {
      const sel = selectedModels[stage.key];
      if (sel && sel !== stage.defaultModel) {
        overrides[stage.key] = sel;
      }
    }
    return overrides;
  },
}));
