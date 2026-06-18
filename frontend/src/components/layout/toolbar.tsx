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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ConnectionPill() {
  const health = useHealthCheck();

  if (health.loading) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Connecting…</span>
      </div>
    );
  }

  if (health.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1">
            <WifiOff className="h-3 w-3 text-red-400" />
            <span className="text-[10px] text-red-400">Backend offline</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Start the backend: <code className="text-xs">make start</code>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!health.ollama) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1">
            <AlertTriangle className="h-3 w-3 text-yellow-400" />
            <span className="text-[10px] text-yellow-400">Ollama offline</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Start Ollama: <code className="text-xs">ollama serve</code>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
      <Wifi className="h-3 w-3 text-primary" />
      <span className="text-[10px] text-primary">Ready</span>
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
    <div className="toolbar-gradient flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-3">
      {/* Branding */}
      <div className="flex items-center gap-2 select-none mr-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 ring-1 ring-primary/40">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          CODE<span className="text-primary">-AI</span>
        </span>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Upload */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
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

      {/* Filename pill */}
      {filename && (
        <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-0.5">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            isAnalyzing ? "bg-primary animate-pulse" :
            isComplete ? "bg-green-400" : "bg-muted-foreground/50"
          )} />
          <span className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">
            {filename}
          </span>
        </div>
      )}

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Analyze / Stop */}
      {isAnalyzing ? (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 gap-1.5 px-3 text-xs"
          onClick={abort}
        >
          <Square className="h-3 w-3" />
          Stop
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className={cn(
                "h-7 gap-1.5 px-3 text-xs",
                canAnalyze
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                  : ""
              )}
              disabled={!canAnalyze}
              onClick={handleAnalyze}
            >
              <Play className="h-3 w-3" />
              Analyze
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {filename ? "Run CVE analysis on current file" : "Upload a file first"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Reset */}
      {(filename || isComplete) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleReset}
              disabled={isAnalyzing}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear and start over</TooltipContent>
        </Tooltip>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* PDF Toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">PDF</span>
            <Switch
              checked={pdfRequested}
              onCheckedChange={setPdfRequested}
              className="scale-75"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">Also generate a PDF report</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-2 h-5" />

      {/* Connection status */}
      <ConnectionPill />
    </div>
  );
}
