"use client";

import { useRef, useCallback } from "react";
import { SSEParser } from "@/lib/sse-parser";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useModelStore } from "@/stores/model-store";
import { useBackendStore } from "@/stores/backend-store";
import type { SSEEvent } from "@/types/events";
import type { FunctionResult } from "@/types/report";
import { toast } from "sonner";

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);

  const startAnalysis = useAnalysisStore((s) => s.startAnalysis);
  const addEvent = useAnalysisStore((s) => s.addEvent);
  const setFunctions = useAnalysisStore((s) => s.setFunctions);
  const upsertFunction = useAnalysisStore((s) => s.upsertFunction);
  const updateFunction = useAnalysisStore((s) => s.updateFunction);
  const addResult = useAnalysisStore((s) => s.addResult);
  const setStage = useAnalysisStore((s) => s.setStage);
  const setComplete = useAnalysisStore((s) => s.setComplete);
  const setError = useAnalysisStore((s) => s.setError);
  const setPdfReady = useAnalysisStore((s) => s.setPdfReady);
  const addFunctionError = useAnalysisStore((s) => s.addFunctionError);

  const routeEvent = useCallback(
    (event: SSEEvent) => {
      addEvent(event);
      const d = event.data;

      switch (event.type) {
        case "stage_start":
          setStage(d.stage as string);
          break;

        case "description_generated":
          upsertFunction(d.function as string, {
            description: d.description as string,
          });
          break;

        case "preprocessing_complete":
          if (Array.isArray(d.functions)) {
            setFunctions(d.functions as string[]);
          }
          break;

        case "function_start":
          updateFunction(d.function as string, { status: "analyzing" });
          break;

        case "rag_complete":
          if (Array.isArray(d.detected_cves)) {
            updateFunction(d.function as string, {
              cveCount: (d.detected_cves as unknown[]).length,
            });
          }
          break;

        case "function_clean":
          updateFunction(d.function as string, {
            status: "clean",
            cveCount: 0,
          });
          break;

        case "fix_result":
          updateFunction(d.function as string, {
            status: d.verdict === "FIX_SUCCESSFUL" ? "fixed" : "vulnerable",
          });
          break;

        case "report_written":
          if (d.result) {
            addResult(d.result as FunctionResult);
          }
          break;

        case "pdf_generated":
          setPdfReady(true);
          break;

        case "pipeline_complete":
          setComplete();
          toast.success("Analysis complete");
          break;

        case "error": {
          const funcName = d.function as string | undefined;
          const stage = d.stage as string | undefined;
          const message = (d.message as string) ?? "Unknown error";

          if (funcName) {
            // Non-terminal: per-function error — pipeline continues with next function
            addFunctionError(funcName, stage ?? "unknown", message);
            updateFunction(funcName, { status: "error" });
            toast.warning(`${funcName}: ${message}`);
          } else {
            // Terminal: pipeline-level error (preprocessing failure, etc.)
            setError(message);
            toast.error(message);
          }
          break;
        }
      }
    },
    [
      addEvent,
      setFunctions,
      upsertFunction,
      updateFunction,
      addResult,
      addFunctionError,
      setStage,
      setComplete,
      setError,
      setPdfReady,
    ]
  );

  const getOverrides = useModelStore((s) => s.getOverrides);
  const getBackendPayload = useBackendStore((s) => s.getRequestPayload);

  const analyze = useCallback(
    async (jobId: string, code: string, pdf: boolean, description?: string) => {
      // Abort any previous stream
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      startAnalysis();

      try {
        // IMPORTANT: SSE must bypass the Next.js dev proxy. Turbopack's
        // dev server gzips text/event-stream responses, which buffers the
        // stream until a compression block fills (~32KB). For tiny, sparse
        // SSE events that means events arrive all-at-once at stream close.
        // Connect directly to the backend (CORS is enabled there).
        const sseBase =
          process.env.NEXT_PUBLIC_SSE_BASE_URL ?? "http://localhost:8000";
        const res = await fetch(`${sseBase}/analyze/${jobId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            code,
            pdf,
            ...(description ? { description } : {}),
            ...(Object.keys(getOverrides()).length > 0 ? { models: getOverrides() } : {}),
            ...getBackendPayload(),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Analysis failed: ${res.status} ${res.statusText}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        const parser = new SSEParser();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const events = parser.feed(chunk);

          for (const event of events) {
            routeEvent(event);
          }
        }

        // Detect unclean disconnect — stream ended without pipeline_complete
        const currentStatus = useAnalysisStore.getState().status;
        if (currentStatus === "analyzing") {
          setError("Connection to analysis server was lost. Please try again.");
          toast.error("Connection lost during analysis");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // User-initiated abort
        }
        const message =
          err instanceof Error ? err.message : "Analysis failed";
        setError(message);
        toast.error(message);
      }
    },
    [startAnalysis, routeEvent, setError, getBackendPayload]
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { analyze, abort };
}
