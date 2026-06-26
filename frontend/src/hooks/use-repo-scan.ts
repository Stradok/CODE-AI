"use client";

import { useRef, useCallback } from "react";
import { SSEParser } from "@/lib/sse-parser";
import { useRepoStore } from "@/stores/repo-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useBackendStore } from "@/stores/backend-store";
import type { SSEEvent } from "@/types/events";
import type { FunctionResult } from "@/types/report";
import { toast } from "sonner";

export function useRepoScan() {
  const abortRef = useRef<AbortController | null>(null);

  // Repo-level state
  const startFetch = useRepoStore((s) => s.startFetch);
  const setFileList = useRepoStore((s) => s.setFileList);
  const setFileScanning = useRepoStore((s) => s.setFileScanning);
  const setFileDone = useRepoStore((s) => s.setFileDone);
  const setFileError = useRepoStore((s) => s.setFileError);
  const incFileVulnCount = useRepoStore((s) => s.incFileVulnCount);
  const setScanComplete = useRepoStore((s) => s.setScanComplete);
  const setScanError = useRepoStore((s) => s.setScanError);
  const githubToken = useRepoStore((s) => s.githubToken);
  const maxFiles = useRepoStore((s) => s.maxFiles);

  // Re-use the analysis event log in the right panel so the user sees live output
  const startAnalysis = useAnalysisStore((s) => s.startAnalysis);
  const addEvent = useAnalysisStore((s) => s.addEvent);
  const setStage = useAnalysisStore((s) => s.setStage);
  const upsertFunction = useAnalysisStore((s) => s.upsertFunction);
  const updateFunction = useAnalysisStore((s) => s.updateFunction);
  const addResult = useAnalysisStore((s) => s.addResult);
  const setComplete = useAnalysisStore((s) => s.setComplete);
  const setError = useAnalysisStore((s) => s.setError);

  const getBackendPayload = useBackendStore((s) => s.getRequestPayload);

  const routeEvent = useCallback(
    (event: SSEEvent) => {
      const d = event.data;
      const file = d.file as string | undefined;

      // Prefix function names with file path so the analysis panel distinguishes them
      const qualifiedName = (fn: string) => (file ? `${file}::${fn}` : fn);

      switch (event.type) {
        // ── Repo-level events ──────────────────────────────────────────
        case "repo_start":
          startFetch();
          addEvent(event);
          break;

        case "repo_files":
          setFileList(d.owner as string, d.repo as string, d.paths as string[]);
          addEvent(event);
          break;

        case "repo_file_start":
          setFileScanning(d.file as string);
          addEvent(event);
          break;

        case "repo_file_done": {
          // Count how many results are in the analysis store for this file
          const results = useAnalysisStore.getState().results;
          const fileVulns = results.filter((r) =>
            r.function_name?.startsWith(file ?? "||NEVER||")
          );
          setFileDone(d.file as string, fileVulns.length);
          addEvent(event);
          break;
        }

        case "repo_file_error":
          setFileError(d.file as string);
          addEvent(event);
          toast.warning(`Scan error: ${d.file} — ${d.error}`);
          break;

        case "repo_complete":
          setScanComplete();
          setComplete();
          addEvent(event);
          toast.success(
            `Repo scan complete — ${d.total_files} file${(d.total_files as number) !== 1 ? "s" : ""} scanned`
          );
          break;

        // ── Per-file pipeline events (re-use analysis panel display) ──
        case "stage_start":
          if (d.stage) setStage(d.stage as string);
          addEvent(event);
          break;

        case "description_generated":
          upsertFunction(qualifiedName(d.function as string), {
            description: d.description as string,
          });
          addEvent(event);
          break;

        case "preprocessing_complete":
          if (Array.isArray(d.functions)) {
            // Functions are prefixed with file path in the function list
            for (const fn of d.functions as string[]) {
              upsertFunction(qualifiedName(fn), {});
            }
          }
          addEvent(event);
          break;

        case "function_start":
          updateFunction(qualifiedName(d.function as string), { status: "analyzing" });
          addEvent(event);
          break;

        case "rag_complete":
          if (Array.isArray(d.detected_cves) && (d.detected_cves as unknown[]).length > 0) {
            incFileVulnCount(file ?? "");
          }
          updateFunction(qualifiedName(d.function as string), {
            cveCount: (d.detected_cves as unknown[]).length,
          });
          addEvent(event);
          break;

        case "function_clean":
          updateFunction(qualifiedName(d.function as string), { status: "clean", cveCount: 0 });
          addEvent(event);
          break;

        case "fix_result":
          updateFunction(qualifiedName(d.function as string), {
            status: d.verdict === "FIX_SUCCESSFUL" ? "fixed" : "vulnerable",
          });
          addEvent(event);
          break;

        case "report_written":
          if (d.result) addResult(d.result as FunctionResult);
          addEvent(event);
          break;

        case "error": {
          const message = (d.message as string) ?? "Unknown error";
          const stage = d.stage as string | undefined;
          if (file && d.function) {
            updateFunction(qualifiedName(d.function as string), { status: "error" });
          } else if (!file && stage === "github_fetch") {
            setScanError(message);
            setError(message);
            toast.error(message);
          }
          addEvent(event);
          break;
        }

        default:
          addEvent(event);
      }
    },
    [
      startFetch,
      setFileList,
      setFileScanning,
      setFileDone,
      setFileError,
      incFileVulnCount,
      setScanComplete,
      setScanError,
      startAnalysis,
      addEvent,
      setStage,
      upsertFunction,
      updateFunction,
      addResult,
      setComplete,
      setError,
    ]
  );

  const scan = useCallback(
    async (repoUrl: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      startAnalysis();

      const sseBase = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

      try {
        const res = await fetch(`${sseBase}/scan-repo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            repo_url: repoUrl,
            ...(githubToken ? { github_token: githubToken } : {}),
            max_files: maxFiles,
            ...getBackendPayload(),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          throw new Error(`Scan failed: ${res.status} — ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        const parser = new SSEParser();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const event of parser.feed(chunk)) {
            routeEvent(event);
          }
        }

        const currentStatus = useRepoStore.getState().scanStatus;
        if (currentStatus === "scanning") {
          setScanError("Connection lost during scan. Please try again.");
          toast.error("Connection lost during scan");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Scan failed";
        setScanError(message);
        setError(message);
        toast.error(message);
      }
    },
    [routeEvent, startAnalysis, getBackendPayload, githubToken, maxFiles, setScanError, setError]
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { scan, abort };
}
