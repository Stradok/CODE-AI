import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type LLMBackend = "auto" | "ollama" | "openrouter";

interface BackendState {
  /** User's chosen LLM backend. "auto" defers to the server's env config. */
  backend: LLMBackend;

  /** Master OpenRouter API key — used for all stages unless group keys are set. */
  masterKey: string;

  /** Optional per-model-group keys for parallel rate limits (advanced). */
  groupKeys: {
    reasoning: string;   // deepseek / r1  (preprocessing + RAG)
    coding: string;      // qwen / coder   (recommender + verifier)
    instruction: string; // llama          (validator)
    summarize: string;   // mistral        (reporter)
  };

  setBackend: (b: LLMBackend) => void;
  setMasterKey: (key: string) => void;
  setGroupKey: (group: keyof BackendState["groupKeys"], key: string) => void;

  /** Returns the key/backend to include in the analyze request body. */
  getRequestPayload: () => { backend?: string; openrouter_api_key?: string };
}

export const useBackendStore = create<BackendState>()(
  persist(
    (set, get) => ({
      backend: "auto",
      masterKey: "",
      groupKeys: { reasoning: "", coding: "", instruction: "", summarize: "" },

      setBackend: (b) => set({ backend: b }),
      setMasterKey: (key) => set({ masterKey: key }),
      setGroupKey: (group, key) =>
        set((s) => ({ groupKeys: { ...s.groupKeys, [group]: key } })),

      getRequestPayload: () => {
        const { backend, masterKey } = get();
        if (backend === "auto") return {};
        return {
          backend,
          ...(backend === "openrouter" && masterKey
            ? { openrouter_api_key: masterKey }
            : {}),
        };
      },
    }),
    {
      name: "code-ai-backend-preference",
      storage: createJSONStorage(() => {
        // Safe access during SSR
        if (typeof window === "undefined") return sessionStorage;
        return localStorage;
      }),
    }
  )
);
