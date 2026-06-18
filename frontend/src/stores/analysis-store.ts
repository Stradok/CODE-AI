import { create } from "zustand";
import type { SSEEvent, FunctionInfo } from "@/types/events";
import type { FunctionResult } from "@/types/report";

export type AnalysisStatus =
  | "idle"
  | "analyzing"
  | "complete"
  | "error";

interface FunctionError {
  function: string;
  stage: string;
  message: string;
}

interface AnalysisState {
  status: AnalysisStatus;
  currentStage: string | null;
  events: SSEEvent[];
  functions: FunctionInfo[];
  results: FunctionResult[];
  error: string | null;
  functionErrors: FunctionError[];
  pdfRequested: boolean;
  pdfReady: boolean;
  activeTab: string;

  // Actions
  startAnalysis: () => void;
  addEvent: (event: SSEEvent) => void;
  setFunctions: (names: string[]) => void;
  upsertFunction: (name: string, update: Partial<FunctionInfo>) => void;
  updateFunction: (name: string, update: Partial<FunctionInfo>) => void;
  addResult: (result: FunctionResult) => void;
  addFunctionError: (funcName: string, stage: string, message: string) => void;
  setStage: (stage: string) => void;
  setComplete: () => void;
  setError: (error: string) => void;
  setPdfRequested: (val: boolean) => void;
  setPdfReady: (val: boolean) => void;
  setActiveTab: (tab: string) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  status: "idle",
  currentStage: null,
  events: [],
  functions: [],
  results: [],
  error: null,
  functionErrors: [],
  pdfRequested: false,
  pdfReady: false,
  activeTab: "feed",

  startAnalysis: () =>
    set({
      status: "analyzing",
      currentStage: null,
      events: [],
      functions: [],
      results: [],
      error: null,
      functionErrors: [],
      pdfReady: false,
      activeTab: "feed",
    }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),

  setFunctions: (names) =>
    set((state) => {
      // Merge with any functions already added by description_generated
      const existing = new Map(state.functions.map((f) => [f.name, f]));
      return {
        functions: names.map((name) => ({
          status: "pending" as const,
          ...existing.get(name),
          name,
        })),
      };
    }),

  upsertFunction: (name, update) =>
    set((state) => {
      const exists = state.functions.some((f) => f.name === name);
      if (exists) {
        return {
          functions: state.functions.map((f) =>
            f.name === name ? { ...f, ...update } : f
          ),
        };
      }
      return {
        functions: [
          ...state.functions,
          { name, status: "pending" as const, ...update },
        ],
      };
    }),

  updateFunction: (name, update) =>
    set((state) => ({
      functions: state.functions.map((f) =>
        f.name === name ? { ...f, ...update } : f
      ),
    })),

  addResult: (result) =>
    set((state) => ({
      results: [...state.results, result],
    })),

  addFunctionError: (funcName, stage, message) =>
    set((state) => ({
      functionErrors: [...state.functionErrors, { function: funcName, stage, message }],
    })),

  setStage: (stage) => set({ currentStage: stage }),

  setComplete: () =>
    set({ status: "complete", activeTab: "results" }),

  setError: (error) => set({ status: "error", error }),

  setPdfRequested: (val) => set({ pdfRequested: val }),

  setPdfReady: (val) => set({ pdfReady: val }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () =>
    set({
      status: "idle",
      currentStage: null,
      events: [],
      functions: [],
      results: [],
      error: null,
      functionErrors: [],
      pdfReady: false,
      activeTab: "feed",
    }),
}));
