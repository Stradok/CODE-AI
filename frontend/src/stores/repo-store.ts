"use client";

import { create } from "zustand";

export type ScanMode = "file" | "repo";
export type ScanStatus = "idle" | "fetching" | "scanning" | "complete" | "error";
export type FileStatus = "pending" | "scanning" | "clean" | "vulnerable" | "error";

export interface RepoFileState {
  path: string;
  status: FileStatus;
  vulnCount: number;
  functionCount: number;
}

interface RepoState {
  mode: ScanMode;
  repoUrl: string;
  githubToken: string;
  maxFiles: number;
  scanStatus: ScanStatus;
  owner: string;
  repoName: string;
  files: RepoFileState[];
  currentFile: string | null;
  error: string | null;

  setMode: (mode: ScanMode) => void;
  setRepoUrl: (url: string) => void;
  setGithubToken: (token: string) => void;
  setMaxFiles: (n: number) => void;
  reset: () => void;

  // Actions called by use-repo-scan as events arrive
  startFetch: () => void;
  setFileList: (owner: string, repo: string, paths: string[]) => void;
  setFileScanning: (path: string) => void;
  setFileDone: (path: string, vulnCount: number) => void;
  setFileClean: (path: string) => void;
  setFileError: (path: string) => void;
  incFileVulnCount: (path: string) => void;
  setScanComplete: () => void;
  setScanError: (msg: string) => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  mode: "file",
  repoUrl: "",
  githubToken: "",
  maxFiles: 15,
  scanStatus: "idle",
  owner: "",
  repoName: "",
  files: [],
  currentFile: null,
  error: null,

  setMode: (mode) => set({ mode }),
  setRepoUrl: (repoUrl) => set({ repoUrl }),
  setGithubToken: (githubToken) => set({ githubToken }),
  setMaxFiles: (maxFiles) => set({ maxFiles }),

  reset: () =>
    set({
      scanStatus: "idle",
      owner: "",
      repoName: "",
      files: [],
      currentFile: null,
      error: null,
    }),

  startFetch: () => set({ scanStatus: "fetching", error: null }),

  setFileList: (owner, repoName, paths) =>
    set({
      owner,
      repoName,
      scanStatus: "scanning",
      files: paths.map((p) => ({
        path: p,
        status: "pending",
        vulnCount: 0,
        functionCount: 0,
      })),
    }),

  setFileScanning: (path) =>
    set((s) => ({
      currentFile: path,
      files: s.files.map((f) =>
        f.path === path ? { ...f, status: "scanning" } : f
      ),
    })),

  setFileDone: (path, vulnCount) =>
    set((s) => ({
      currentFile: s.currentFile === path ? null : s.currentFile,
      files: s.files.map((f) =>
        f.path === path
          ? { ...f, status: vulnCount > 0 ? "vulnerable" : "clean", vulnCount }
          : f
      ),
    })),

  setFileClean: (path) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.path === path ? { ...f, status: "clean" } : f
      ),
    })),

  setFileError: (path) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.path === path ? { ...f, status: "error" } : f
      ),
    })),

  incFileVulnCount: (path) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.path === path ? { ...f, vulnCount: f.vulnCount + 1 } : f
      ),
    })),

  setScanComplete: () => set({ scanStatus: "complete", currentFile: null }),

  setScanError: (error) => set({ scanStatus: "error", error, currentFile: null }),
}));
