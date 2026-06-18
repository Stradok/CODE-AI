import { create } from "zustand";
import type { PipelineStage } from "@/types/api";

export interface StageConfig {
  key: PipelineStage;
  label: string;
  defaultModel: string;
}

export const PIPELINE_STAGES: StageConfig[] = [
  { key: "preprocessing",  label: "Preprocessing",  defaultModel: "deepseek-r1:8b" },
  { key: "rag_analyzer",   label: "CVE Detection",  defaultModel: "deepseek-r1:8b" },
  { key: "validator",      label: "Validation",     defaultModel: "llama3.1:8b"    },
  { key: "recommender",    label: "Fix Generation", defaultModel: "qwen2.5-coder:7b" },
  { key: "reporter",       label: "Reporting",      defaultModel: "mistral:7b"     },
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
