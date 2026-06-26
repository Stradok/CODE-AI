"use client";

import { useState, useCallback } from "react";
import {
  GitFork,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Clock,
  KeyRound,
  Hash,
} from "lucide-react";
import { useRepoStore } from "@/stores/repo-store";
import { useRepoScan } from "@/hooks/use-repo-scan";
import { cn } from "@/lib/utils";
import type { RepoFileState, FileStatus } from "@/stores/repo-store";

// ─── File row ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case "scanning":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#6C63FF]" />;
    case "clean":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#38A169]" />;
    case "vulnerable":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#D69E2E]" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />;
    default:
      return <Clock className="h-3.5 w-3.5 shrink-0 text-[#B0BEC5]" />;
  }
}

function FileRow({ file }: { file: RepoFileState }) {
  const parts = file.path.split("/");
  const filename = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join("/");

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all",
        file.status === "scanning"
          ? "bg-[#E0E5EC] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]"
          : "bg-transparent hover:bg-[#E0E5EC] hover:shadow-[inset_2px_2px_4px_rgb(163,177,198,0.4),inset_-2px_-2px_4px_rgba(255,255,255,0.4)]"
      )}
    >
      <StatusIcon status={file.status} />
      <div className="min-w-0 flex-1">
        {dir && (
          <span className="block truncate font-mono text-[9px] text-[#A0AEC0]">{dir}/</span>
        )}
        <span className="block truncate font-mono text-[11px] text-[#3D4852]">{filename}</span>
      </div>
      {file.status === "vulnerable" && file.vulnCount > 0 && (
        <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[9px] font-semibold text-[#D69E2E] shadow-[inset_2px_2px_3px_rgba(214,158,46,0.15),inset_-2px_-2px_3px_rgba(255,255,255,0.5)]">
          {file.vulnCount} CVE
        </span>
      )}
      {file.status === "clean" && (
        <span className="shrink-0 rounded-full bg-[#F0FFF4] px-2 py-0.5 text-[9px] font-semibold text-[#38A169] shadow-[inset_2px_2px_3px_rgba(56,161,105,0.15),inset_-2px_-2px_3px_rgba(255,255,255,0.5)]">
          clean
        </span>
      )}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ files }: { files: RepoFileState[] }) {
  if (!files.length) return null;
  const done = files.filter((f) => f.status !== "pending" && f.status !== "scanning").length;
  const pct = Math.round((done / files.length) * 100);
  return (
    <div className="space-y-1 px-1">
      <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
        <span>
          {done} / {files.length} files
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]">
        <div
          className="h-full rounded-full bg-[#6C63FF] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function RepoPanel() {
  const repoUrl = useRepoStore((s) => s.repoUrl);
  const setRepoUrl = useRepoStore((s) => s.setRepoUrl);
  const githubToken = useRepoStore((s) => s.githubToken);
  const setGithubToken = useRepoStore((s) => s.setGithubToken);
  const maxFiles = useRepoStore((s) => s.maxFiles);
  const setMaxFiles = useRepoStore((s) => s.setMaxFiles);
  const scanStatus = useRepoStore((s) => s.scanStatus);
  const owner = useRepoStore((s) => s.owner);
  const repoName = useRepoStore((s) => s.repoName);
  const files = useRepoStore((s) => s.files);
  const error = useRepoStore((s) => s.error);
  const reset = useRepoStore((s) => s.reset);

  const { scan, abort } = useRepoScan();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const isScanning = scanStatus === "scanning" || scanStatus === "fetching";
  const isDone = scanStatus === "complete" || scanStatus === "error";

  const handleScan = useCallback(() => {
    setUrlError(null);
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setUrlError("Enter a GitHub repository URL");
      return;
    }
    if (!/github\.com\/[^/]+\/[^/]+/.test(trimmed)) {
      setUrlError("Must be a GitHub repo URL — e.g. https://github.com/owner/repo");
      return;
    }
    scan(trimmed);
  }, [repoUrl, scan]);

  const handleReset = useCallback(() => {
    abort();
    reset();
    setUrlError(null);
  }, [abort, reset]);

  const vulnFiles = files.filter((f) => f.status === "vulnerable").length;
  const cleanFiles = files.filter((f) => f.status === "clean").length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden bg-[#E0E5EC] p-4">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E0E5EC] shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
          <GitFork className="h-4 w-4 text-[#3D4852]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#3D4852]">GitHub Repo Scanner</p>
          <p className="text-[10px] text-[#6B7280]">Scan any public repo for CVEs</p>
        </div>
      </div>

      {/* URL input + scan button */}
      <div className="shrink-0 space-y-2">
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 py-2.5 transition-all",
            urlError
              ? "shadow-[inset_3px_3px_6px_rgba(220,38,38,0.2),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]"
              : "shadow-[inset_4px_4px_8px_rgb(163,177,198,0.6),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]"
          )}
        >
          <GitFork className="h-3.5 w-3.5 shrink-0 text-[#A0AEC0]" />
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && !isScanning && handleScan()}
            placeholder="https://github.com/owner/repo"
            disabled={isScanning}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[#3D4852] placeholder:text-[#A0AEC0] focus:outline-none disabled:opacity-50"
          />
        </div>
        {urlError && (
          <p className="px-1 text-[10px] text-[#DC2626]">{urlError}</p>
        )}

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 px-1 text-[10px] text-[#6B7280] hover:text-[#3D4852]"
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-2">
            {/* GitHub token */}
            <div className="flex items-center gap-2 rounded-xl bg-[#E0E5EC] px-3 py-2 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
              <KeyRound className="h-3 w-3 shrink-0 text-[#A0AEC0]" />
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="GitHub token (optional — raises rate limit)"
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[#3D4852] placeholder:text-[#A0AEC0] focus:outline-none"
              />
            </div>
            {/* Max files */}
            <div className="flex items-center gap-2 rounded-xl bg-[#E0E5EC] px-3 py-2 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
              <Hash className="h-3 w-3 shrink-0 text-[#A0AEC0]" />
              <span className="shrink-0 text-xs text-[#6B7280]">Max files</span>
              <input
                type="number"
                min={1}
                max={50}
                value={maxFiles}
                onChange={(e) => setMaxFiles(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-12 bg-transparent text-right font-mono text-xs text-[#3D4852] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {isScanning ? (
            <button
              onClick={handleReset}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#DC2626] px-4 py-2 text-xs font-medium text-white shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)] transition-all hover:-translate-y-px hover:shadow-[8px_8px_14px_rgb(163,177,198,0.7),-8px_-8px_14px_rgba(255,255,255,0.6)]"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={handleScan}
                disabled={!repoUrl.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#6C63FF] px-4 py-2 text-xs font-medium text-white shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)] transition-all hover:-translate-y-px hover:shadow-[8px_8px_14px_rgb(163,177,198,0.7),-8px_-8px_14px_rgba(255,255,255,0.6)] active:translate-y-0 active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] disabled:pointer-events-none disabled:opacity-40"
              >
                <Play className="h-3 w-3" />
                {isDone ? "Scan Again" : "Scan Repo"}
              </button>
              {isDone && (
                <button
                  onClick={handleReset}
                  className="rounded-2xl bg-[#E0E5EC] px-3 py-2 text-xs text-[#6B7280] shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)] transition-all hover:text-[#3D4852]"
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Results area */}
      {(files.length > 0 || scanStatus === "fetching") && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Repo label */}
          {owner && (
            <div className="shrink-0">
              <p className="truncate font-mono text-[11px] font-semibold text-[#3D4852]">
                {owner}/{repoName}
              </p>
              {isDone && files.length > 0 && (
                <p className="text-[10px] text-[#6B7280]">
                  {vulnFiles > 0 ? (
                    <span className="text-[#D69E2E]">{vulnFiles} file{vulnFiles !== 1 ? "s" : ""} with CVEs</span>
                  ) : (
                    <span className="text-[#38A169]">No CVEs found</span>
                  )}
                  {cleanFiles > 0 && vulnFiles > 0 && (
                    <span> · {cleanFiles} clean</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Progress bar */}
          {isScanning && <ProgressBar files={files} />}

          {/* Fetching spinner */}
          {scanStatus === "fetching" && files.length === 0 && (
            <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching file list from GitHub…
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="flex-1 overflow-y-auto overscroll-contain space-y-0.5 pr-1">
              {files.map((f) => (
                <FileRow key={f.path} file={f} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Idle state */}
      {scanStatus === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#E0E5EC] shadow-[inset_5px_5px_10px_rgb(163,177,198,0.6),inset_-5px_-5px_10px_rgba(255,255,255,0.5)]">
            <GitFork className="h-8 w-8 text-[#6C63FF]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#3D4852]">Scan a GitHub repo</p>
            <p className="mt-1 max-w-[220px] text-[11px] text-[#6B7280]">
              Paste any public GitHub URL above. CVE-sensitive files are scanned first.
            </p>
          </div>
          <div className="rounded-xl bg-[#E0E5EC] px-3 py-2 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)] text-[10px] text-[#6B7280] text-left space-y-1">
            <p className="font-semibold text-[#3D4852]">What it does:</p>
            <p>• Fetches Python files (skips tests, migrations)</p>
            <p>• Prioritises auth, crypto, SQL, session files</p>
            <p>• Runs the full CVE pipeline on each file</p>
            <p>• Shows CVEs + generated fixes in the right panel</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="shrink-0 rounded-xl bg-[#FEE2E2] px-3 py-2 text-[11px] text-[#DC2626] shadow-[inset_2px_2px_4px_rgba(220,38,38,0.1)]">
          {error}
        </div>
      )}
    </div>
  );
}
