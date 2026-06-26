"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CodeEditor } from "@/components/editor/code-editor";
import { FileDropZone } from "@/components/editor/file-drop-zone";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { RepoPanel } from "@/components/github/repo-panel";
import { useEditorStore } from "@/stores/editor-store";
import { useRepoStore } from "@/stores/repo-store";
import {
  ShieldCheck,
  Upload,
  Cpu,
  Database,
  Zap,
  FileCode2,
  GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 p-8 select-none bg-[#E0E5EC]">
      {/* Hero icon well */}
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-[32px] bg-[#E0E5EC] shadow-[inset_6px_6px_10px_rgb(163,177,198,0.6),inset_-6px_-6px_10px_rgba(255,255,255,0.5)]">
            <ShieldCheck className="h-10 w-10 text-[#6C63FF]" />
          </div>
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#E0E5EC] shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]">
            <div className="h-2 w-2 rounded-full bg-[#6C63FF]" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#3D4852]">
            Drop your Python file to begin
          </h2>
          <p className="mt-2 max-w-xs text-sm text-[#6B7280]">
            CODE-AI detects CVEs in your code using local LLMs and RAG over the
            NVD database — no data leaves your machine.
          </p>
        </div>
      </div>

      {/* Pipeline steps - neumorphic chips */}
      <div className="flex items-start gap-4">
        {STEPS.map((step, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-[inset_4px_4px_8px_rgb(163,177,198,0.6),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]">
              <step.icon className="h-4 w-4 text-[#6B7280]" />
            </div>
            <span className="text-[10px] text-[#6B7280] text-center leading-tight max-w-[60px] font-medium">
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="mt-1 h-px w-8 bg-[#B0BEC5]/30" />
            )}
          </div>
        ))}
      </div>

      {/* Hint pill */}
      <div className="flex items-center gap-2.5 rounded-2xl bg-[#E0E5EC] px-5 py-3 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)] text-xs text-[#6B7280]">
        <Upload className="h-4 w-4 shrink-0" />
        <span>
          Click <strong>Upload</strong> in the toolbar or drag & drop a{" "}
          <code className="rounded bg-[#D1D9E6] px-1 font-mono">.py</code> file here
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

// ─── Mode toggle ─────────────────────────────────────────────────────────────

interface ModeTabProps {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}

function ModeTab({ label, icon: Icon, active, onClick }: ModeTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all duration-200 select-none",
        active
          ? "bg-[#E0E5EC] text-[#6C63FF] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]"
          : "text-[#6B7280] hover:text-[#3D4852] hover:shadow-[3px_3px_6px_rgb(163,177,198,0.4),-3px_-3px_6px_rgba(255,255,255,0.4)]"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

export function IdeLayout() {
  const filename = useEditorStore((s) => s.filename);
  const description = useEditorStore((s) => s.description);
  const setDescription = useEditorStore((s) => s.setDescription);

  const mode = useRepoStore((s) => s.mode);
  const setMode = useRepoStore((s) => s.setMode);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="flex-1 overflow-hidden bg-[#E0E5EC]"
    >
      {/* Left panel */}
      <ResizablePanel defaultSize="72%" minSize="30%">
        <div className="flex h-full flex-col bg-[#E0E5EC]">
          {/* Mode toggle */}
          <div className="flex shrink-0 items-center gap-1 bg-[#E0E5EC] px-3 py-2 shadow-[0_2px_4px_rgb(163,177,198,0.2)]">
            <ModeTab
              label="File"
              icon={FileCode2}
              active={mode === "file"}
              onClick={() => setMode("file")}
            />
            <ModeTab
              label="GitHub Repo"
              icon={GitFork}
              active={mode === "repo"}
              onClick={() => setMode("repo")}
            />
          </div>

          {mode === "repo" ? (
            <div className="flex-1 overflow-hidden">
              <RepoPanel />
            </div>
          ) : (
            <>
              {/* Editor tab bar */}
              {filename && (
                <div className="flex shrink-0 items-center bg-[#E0E5EC] shadow-[0_2px_4px_rgb(163,177,198,0.2)]">
                  <div className="flex items-center gap-2.5 bg-[#E0E5EC] px-4 py-1.5 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)] rounded-tr-xl">
                    <div className="h-2 w-2 rounded-full bg-[#6C63FF]" />
                    <span className="font-mono text-[11px] font-semibold text-[#3D4852]">
                      {filename}
                    </span>
                  </div>
                </div>
              )}

              {/* Description input */}
              {filename && (
                <div className="shrink-0 bg-[#E0E5EC] px-4 py-2.5 shadow-[inset_0_-2px_4px_rgb(163,177,198,0.15)]">
                  <div className="flex items-start gap-2.5 rounded-2xl bg-[#E0E5EC] px-4 py-2.5 shadow-[inset_4px_4px_8px_rgb(163,177,198,0.6),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what this code does (optional — AI generates one if empty)"
                      rows={1}
                      className="w-full resize-none bg-transparent font-sans text-xs text-[#3D4852] placeholder:text-[#A0AEC0] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Editor / drop zone / empty state */}
              <div className="flex-1 overflow-hidden">
                <FileDropZone>
                  {filename ? <CodeEditor /> : <EmptyState />}
                </FileDropZone>
              </div>
            </>
          )}
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
