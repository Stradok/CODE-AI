"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CodeEditor } from "@/components/editor/code-editor";
import { FileDropZone } from "@/components/editor/file-drop-zone";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { useEditorStore } from "@/stores/editor-store";
import {
  ShieldCheck,
  Upload,
  Cpu,
  Database,
  Zap,
  MessageSquare,
} from "lucide-react";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8 select-none">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary/30 ring-2 ring-background" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Drop your Python file to begin
          </h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            CODE-AI detects CVEs in your code using local LLMs and RAG over the
            NVD database — no data leaves your machine.
          </p>
        </div>
      </div>

      {/* Pipeline steps */}
      <div className="flex items-start gap-3">
        {STEPS.map((step, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-border">
              <step.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[60px]">
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="absolute mt-4 h-px w-6 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
        <Upload className="h-3.5 w-3.5 shrink-0" />
        <span>
          Click <strong>Upload</strong> in the toolbar or drag & drop a{" "}
          <code className="rounded bg-muted/60 px-1">.py</code> file here
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: Cpu, label: "Parse AST" },
  { icon: Database, label: "RAG CVE search" },
  { icon: ShieldCheck, label: "Validate" },
  { icon: Zap, label: "Generate fix" },
];

export function IdeLayout() {
  const filename = useEditorStore((s) => s.filename);
  const description = useEditorStore((s) => s.description);
  const setDescription = useEditorStore((s) => s.setDescription);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="flex-1 overflow-hidden border-t border-border"
    >
      {/* Left panel: Code Editor */}
      <ResizablePanel defaultSize="72%" minSize="30%">
        <div className="flex h-full flex-col">
          {/* Editor tab bar */}
          {filename && (
            <div className="flex shrink-0 items-center border-b border-border bg-muted/20">
              <div className="flex items-center gap-2 border-r border-border/60 bg-background/50 px-4 py-1.5">
                <div className="h-2 w-2 rounded-full bg-primary/60" />
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {filename}
                </span>
              </div>
            </div>
          )}

          {/* Description input */}
          {filename && (
            <div className="shrink-0 border-b border-border bg-muted/10 px-4 py-2">
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-[5px] h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <div className="flex-1">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this code does (optional — AI generates one if empty)"
                    rows={1}
                    className="w-full resize-none bg-transparent font-sans text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Editor / drop zone / empty state */}
          <div className="flex-1 overflow-hidden">
            <FileDropZone>
              {filename ? <CodeEditor /> : <EmptyState />}
            </FileDropZone>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right panel: Analysis */}
      <ResizablePanel defaultSize="28%" minSize="20%">
        <AnalysisPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
