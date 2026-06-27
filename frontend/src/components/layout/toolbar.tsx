"use client";

import { useRef, useCallback } from "react";
import {
  Upload,
  Play,
  FileText,
  ShieldCheck,
  Square,
  RotateCcw,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorStore } from "@/stores/editor-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useSSE } from "@/hooks/use-sse";
import { useHealthCheck } from "@/hooks/use-health-check";
import { uploadFile } from "@/lib/api";
import { ModelSelector } from "@/components/layout/model-selector";
import { BackendSelector } from "@/components/layout/backend-selector";
import { useBackendStore } from "@/stores/backend-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ConnectionPill() {
  const health = useHealthCheck();
  const backend = useBackendStore((s) => s.backend);
  const orKey = useBackendStore((s) => s.orKey);
  const orConnected = useBackendStore((s) => s.orConnected);
  const stageConfigs = useBackendStore((s) => s.stageConfigs);

  // Effective backend: user choice or server default
  const effective =
    backend === "auto" ? (health.backend ?? "ollama") : backend;

  if (health.loading) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-[#E0E5EC] px-1.5 py-1 sm:px-2.5 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
        <Loader2 className="h-3 w-3 animate-spin text-[#6B7280]" />
        <span className="hidden sm:inline text-[10px] text-[#6B7280]">Connecting…</span>
      </div>
    );
  }

  if (health.error) {
    return (
      <Tooltip>
        <TooltipTrigger className="flex cursor-default items-center gap-1.5 rounded-full bg-[#FEE2E2] px-1.5 py-1 sm:px-2.5 shadow-[inset_3px_3px_6px_rgba(220,38,38,0.15),inset_-3px_-3px_6px_rgba(255,255,255,0.3)]">
          <WifiOff className="h-3 w-3 text-[#DC2626]" />
          <span className="hidden sm:inline text-[10px] text-[#DC2626]">Backend offline</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Start the backend: <code className="text-xs">make start</code>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Custom per-stage mode
  if (effective === "custom") {
    const count = Object.values(stageConfigs).filter((c) => c?.apiKey).length;
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-[#E0E5EC] px-1.5 py-1 sm:px-2.5 shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]">
        <Wifi className="h-3 w-3 text-[#6C63FF]" />
        <span className="hidden sm:inline text-[10px] text-[#6C63FF]">{count > 0 ? `Custom (${count})` : "Custom"}</span>
      </div>
    );
  }

  // Cloud OpenRouter mode
  if (effective === "openrouter") {
    if (!orKey.trim()) {
      return (
        <Tooltip>
          <TooltipTrigger className="flex cursor-default items-center gap-1.5 rounded-full bg-[#FEF3C7] px-1.5 py-1 sm:px-2.5 shadow-[inset_3px_3px_6px_rgba(214,158,46,0.15),inset_-3px_-3px_6px_rgba(255,255,255,0.3)]">
            <AlertTriangle className="h-3 w-3 text-[#D69E2E]" />
            <span className="hidden sm:inline text-[10px] text-[#D69E2E]">Sign in</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Click the Backend button and sign in with OpenRouter
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-[#E0E5EC] px-1.5 py-1 sm:px-2.5 shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]">
        <Wifi className="h-3 w-3 text-[#6C63FF]" />
        <span className="hidden sm:inline text-[10px] text-[#6C63FF]">{orConnected ? "OpenRouter ✓" : "Cloud"}</span>
      </div>
    );
  }

  // Local Ollama mode
  if (!health.ollama) {
    return (
      <Tooltip>
        <TooltipTrigger className="flex cursor-default items-center gap-1.5 rounded-full bg-[#FEF3C7] px-1.5 py-1 sm:px-2.5 shadow-[inset_3px_3px_6px_rgba(214,158,46,0.15),inset_-3px_-3px_6px_rgba(255,255,255,0.3)]">
          <AlertTriangle className="h-3 w-3 text-[#D69E2E]" />
          <span className="hidden sm:inline text-[10px] text-[#D69E2E]">Ollama offline</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Start Ollama: <code className="text-xs">ollama serve</code>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-[#E0E5EC] px-1.5 py-1 sm:px-2.5 shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]">
      <Wifi className="h-3 w-3 text-[#6C63FF]" />
      <span className="hidden sm:inline text-[10px] text-[#6C63FF]">Ready</span>
    </div>
  );
}

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobId = useEditorStore((s) => s.jobId);
  const code = useEditorStore((s) => s.code);
  const description = useEditorStore((s) => s.description);
  const filename = useEditorStore((s) => s.filename);
  const setFile = useEditorStore((s) => s.setFile);
  const resetEditor = useEditorStore((s) => s.reset);

  const analysisStatus = useAnalysisStore((s) => s.status);
  const pdfRequested = useAnalysisStore((s) => s.pdfRequested);
  const setPdfRequested = useAnalysisStore((s) => s.setPdfRequested);
  const resetAnalysis = useAnalysisStore((s) => s.reset);

  const { analyze, abort } = useSSE();

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".py")) {
        toast.error("Only Python (.py) files are supported");
        e.target.value = "";
        return;
      }

      try {
        const result = await uploadFile(file);
        setFile(result.filename, result.code, result.job_id);
        resetAnalysis();
        toast.success(`Loaded ${result.filename}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
      e.target.value = "";
    },
    [setFile, resetAnalysis]
  );

  const handleAnalyze = useCallback(() => {
    if (!jobId || !code) return;
    analyze(jobId, code, pdfRequested, description || undefined);
  }, [jobId, code, pdfRequested, description, analyze]);

  const handleReset = useCallback(() => {
    abort();
    resetEditor();
    resetAnalysis();
  }, [abort, resetEditor, resetAnalysis]);

  const isAnalyzing = analysisStatus === "analyzing";
  const isComplete = analysisStatus === "complete" || analysisStatus === "error";
  const canAnalyze = !!filename && !isAnalyzing;

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 bg-[#E0E5EC] px-2 sm:gap-1.5 sm:px-3 shadow-[0_4px_6px_rgb(163,177,198,0.3)] relative z-10">
      {/* Branding */}
      <div className="flex items-center gap-2 select-none mr-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#E0E5EC] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
          <ShieldCheck className="h-4 w-4 text-[#6C63FF]" />
        </div>
        <span className="hidden sm:inline text-sm font-bold tracking-tight text-[#3D4852]">
          CODE<span className="text-[#6C63FF]">-AI</span>
        </span>
      </div>

      <Separator orientation="vertical" className="hidden sm:block mx-1 h-5 bg-[#B0BEC5]/30" />

      {/* Upload */}
      <Tooltip>
        <TooltipTrigger
          className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-transparent text-[#6B7280] hover:text-[#3D4852] hover:shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)] active:shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)] h-8 gap-1.5 px-2 sm:px-3 text-xs transition-all duration-300 ease-out outline-none select-none disabled:pointer-events-none disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Upload a Python (.py) file</TooltipContent>
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        accept=".py"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Filename pill — desktop only */}
      {filename && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-[#E0E5EC] px-3 py-1 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            isAnalyzing ? "bg-[#6C63FF] animate-pulse-soft" :
            isComplete ? "bg-[#38A169]" : "bg-[#6B7280]/50"
          )} />
          <span className="max-w-[120px] truncate font-mono text-[11px] text-[#6B7280]">
            {filename}
          </span>
        </div>
      )}

      <Separator orientation="vertical" className="hidden sm:block mx-1 h-5 bg-[#B0BEC5]/30" />

      {/* Analyze / Stop */}
      {isAnalyzing ? (
        <Button
          variant="destructive"
          size="sm"
          className="h-8 gap-1.5 px-2 sm:px-3 text-xs"
          onClick={abort}
        >
          <Square className="h-3 w-3" />
          <span className="hidden sm:inline">Stop</span>
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#6C63FF] text-white shadow-[9px_9px_16px_rgb(163,177,198,0.6),-9px_-9px_16px_rgba(255,255,255,0.5)] hover:-translate-y-[1px] hover:shadow-[12px_12px_20px_rgb(163,177,198,0.7),-12px_-12px_20px_rgba(255,255,255,0.6)] active:translate-y-[0.5px] active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2),inset_-3px_-3px_6px_rgba(255,255,255,0.1)] h-8 gap-1.5 px-2 sm:px-3 text-xs font-medium transition-all duration-300 ease-out outline-none select-none disabled:pointer-events-none disabled:opacity-50",
              !canAnalyze && "opacity-50"
            )}
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            <Play className="h-3 w-3" />
            <span className="hidden sm:inline">Analyze</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {filename ? "Run CVE analysis on current file" : "Upload a file first"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Reset */}
      {(filename || isComplete) && (
        <Tooltip>
          <TooltipTrigger
            className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-transparent text-[#6B7280] hover:text-[#3D4852] hover:shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)] active:shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)] h-8 w-8 transition-all duration-300 ease-out outline-none select-none disabled:pointer-events-none disabled:opacity-50"
            onClick={handleReset}
            disabled={isAnalyzing}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear and start over</TooltipContent>
        </Tooltip>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* PDF Toggle — desktop only */}
      <div className="hidden sm:flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] rounded-xl px-1">
            <FileText className="h-3.5 w-3.5 text-[#6B7280]" />
            <span className="text-[11px] text-[#6B7280]">PDF</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Also generate a PDF report</TooltipContent>
        </Tooltip>
        <Switch
          checked={pdfRequested}
          onCheckedChange={setPdfRequested}
          className="scale-75"
        />
        <Separator orientation="vertical" className="mx-2 h-5 bg-[#B0BEC5]/30" />
      </div>

      {/* Model selector — desktop only */}
      <div className="hidden sm:block">
        <ModelSelector />
      </div>

      <Separator orientation="vertical" className="hidden sm:block mx-2 h-5 bg-[#B0BEC5]/30" />

      {/* Backend selector */}
      <BackendSelector />

      <Separator orientation="vertical" className="mx-1 sm:mx-2 h-5 bg-[#B0BEC5]/30" />

      {/* Connection status */}
      <ConnectionPill />
    </div>
  );
}
