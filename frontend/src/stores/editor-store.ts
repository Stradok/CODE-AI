import { create } from "zustand";

interface EditorState {
  code: string;
  description: string;
  filename: string | null;
  jobId: string | null;
  isDirty: boolean;

  setCode: (code: string) => void;
  setDescription: (description: string) => void;
  setFile: (filename: string, code: string, jobId: string) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  code: "",
  description: "",
  filename: null,
  jobId: null,
  isDirty: false,

  setCode: (code) => {
    const state = get();
    set({
      code,
      isDirty: state.filename !== null,
    });
  },

  setDescription: (description) => set({ description }),

  setFile: (filename, code, jobId) =>
    set({
      filename,
      code,
      jobId,
      isDirty: false,
    }),

  reset: () =>
    set({
      code: "",
      description: "",
      filename: null,
      jobId: null,
      isDirty: false,
    }),
}));
