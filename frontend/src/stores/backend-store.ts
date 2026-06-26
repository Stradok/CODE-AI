import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PipelineStage, StageKeyConfig } from "@/types/api";

export type LLMBackend = "ollama" | "openrouter" | "custom" | "auto";

export function detectProvider(model: string): "openai" | "anthropic" | "openrouter" {
  const prefix = model.split("/")[0].toLowerCase();
  if (prefix === "openai") return "openai";
  if (prefix === "anthropic") return "anthropic";
  return "openrouter";
}

export const PROVIDER_KEY_LABELS: Record<string, string> = {
  openai: "OpenAI key (sk-…)",
  anthropic: "Anthropic key (sk-ant-…)",
  openrouter: "OpenRouter key (sk-or-…)",
};

interface BackendState {
  backend: LLMBackend;

  // ── OpenRouter OAuth mode ──────────────────────────────────────────────────
  orKey: string;                // API key obtained via OAuth or pasted manually
  orConnected: boolean;         // true when key came from OAuth flow

  // ── Custom per-stage mode ─────────────────────────────────────────────────
  stageConfigs: Partial<Record<PipelineStage, { model: string; apiKey: string }>>;

  // ── Actions ───────────────────────────────────────────────────────────────
  setBackend: (b: LLMBackend) => void;
  setOrKey: (key: string, connected?: boolean) => void;
  setStageConfig: (stage: PipelineStage, model: string, apiKey: string) => void;
  clearStageConfig: (stage: PipelineStage) => void;
  resetCustom: () => void;

  /** Returns fields to spread into the AnalyzeRequest body. */
  getRequestPayload: () => {
    backend?: string;
    openrouter_api_key?: string;
    stage_configs?: Partial<Record<PipelineStage, StageKeyConfig>>;
  };
}

export const useBackendStore = create<BackendState>()(
  persist(
    (set, get) => ({
      backend: "auto",
      orKey: "",
      orConnected: false,
      stageConfigs: {},

      setBackend: (b) => set({ backend: b }),

      setOrKey: (key, connected = false) =>
        set({ orKey: key, orConnected: connected }),

      setStageConfig: (stage, model, apiKey) =>
        set((s) => ({
          stageConfigs: { ...s.stageConfigs, [stage]: { model, apiKey } },
        })),

      clearStageConfig: (stage) =>
        set((s) => {
          const next = { ...s.stageConfigs };
          delete next[stage];
          return { stageConfigs: next };
        }),

      resetCustom: () => set({ stageConfigs: {} }),

      getRequestPayload: () => {
        const { backend, orKey, stageConfigs } = get();

        if (backend === "auto" || backend === "ollama") {
          return backend === "ollama" ? { backend: "ollama" } : {};
        }

        if (backend === "openrouter") {
          return {
            backend: "openrouter",
            ...(orKey ? { openrouter_api_key: orKey } : {}),
          };
        }

        // custom — build per-stage configs
        const configs: Partial<Record<PipelineStage, StageKeyConfig>> = {};
        for (const [stage, cfg] of Object.entries(stageConfigs)) {
          if (cfg && (cfg.model || cfg.apiKey)) {
            configs[stage as PipelineStage] = {
              model: cfg.model,
              api_key: cfg.apiKey,
              provider: detectProvider(cfg.model),
            };
          }
        }
        return { backend: "custom", stage_configs: configs };
      },
    }),
    {
      name: "code-ai-backend-preference",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return sessionStorage;
        return localStorage;
      }),
    }
  )
);
