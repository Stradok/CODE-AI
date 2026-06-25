"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cpu,
  Cloud,
  Settings2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useBackendStore, type LLMBackend } from "@/stores/backend-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Option card
// ---------------------------------------------------------------------------

function OptionCard({
  active,
  onClick,
  icon,
  headline,
  tagline,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  headline: string;
  tagline: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl p-3 text-left transition-all duration-200 outline-none",
        active
          ? "bg-[#E0E5EC] shadow-[inset_4px_4px_8px_rgb(163,177,198,0.7),inset_-4px_-4px_8px_rgba(255,255,255,0.6)]"
          : "bg-[#E0E5EC] shadow-[6px_6px_12px_rgb(163,177,198,0.6),-6px_-6px_12px_rgba(255,255,255,0.7)] hover:shadow-[8px_8px_16px_rgb(163,177,198,0.7),-8px_-8px_16px_rgba(255,255,255,0.8)]"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Radio dot */}
        <div className="mt-0.5 shrink-0">
          <div
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-all",
              active
                ? "border-[#6C63FF] bg-[#6C63FF] shadow-[0_0_0_2px_rgba(108,99,255,0.2)]"
                : "border-[#B0BEC5] bg-transparent"
            )}
          >
            {active && (
              <div className="m-auto mt-[3px] h-[6px] w-[6px] rounded-full bg-white" />
            )}
          </div>
        </div>

        {/* Icon */}
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-all",
            active
              ? "bg-[#6C63FF] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]"
              : "bg-[#E0E5EC] shadow-[3px_3px_6px_rgb(163,177,198,0.5),-3px_-3px_6px_rgba(255,255,255,0.6)]"
          )}
        >
          <div className={active ? "text-white" : "text-[#6B7280]"}>{icon}</div>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-wide",
              active ? "text-[#6C63FF]" : "text-[#3D4852]"
            )}
          >
            {headline}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[#6B7280]">{tagline}</p>
        </div>
      </div>

      {/* Expandable slot — only shown when card is active */}
      {active && children && (
        <div
          className="mt-3 ml-[56px]"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Key input
// ---------------------------------------------------------------------------

function KeyInput({
  label,
  value,
  onChange,
  placeholder = "sk-or-v1-…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            "w-full rounded-xl py-1.5 pl-2.5 pr-8 font-mono text-[10px] text-[#3D4852]",
            "bg-[#E0E5EC] outline-none placeholder:text-[#B0BEC5]",
            "shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
            "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC]",
            "transition-all"
          )}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#3D4852] transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BackendSelector() {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const backend = useBackendStore((s) => s.backend);
  const masterKey = useBackendStore((s) => s.masterKey);
  const groupKeys = useBackendStore((s) => s.groupKeys);
  const setBackend = useBackendStore((s) => s.setBackend);
  const setMasterKey = useBackendStore((s) => s.setMasterKey);
  const setGroupKey = useBackendStore((s) => s.setGroupKey);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const LABELS: Record<LLMBackend, string> = {
    auto: "Auto",
    ollama: "Local",
    openrouter: "Cloud",
  };

  const ICONS: Record<LLMBackend, React.ReactNode> = {
    auto: <Settings2 className="h-3 w-3" />,
    ollama: <Cpu className="h-3 w-3" />,
    openrouter: <Cloud className="h-3 w-3" />,
  };

  const hasKey = backend === "openrouter" && masterKey.trim().length > 0;
  const needsKey = backend === "openrouter" && !hasKey;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl h-8 px-3 text-xs",
          "transition-all duration-300 ease-out outline-none select-none",
          open || backend !== "auto"
            ? "bg-[#6C63FF] text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2),inset_-3px_-3px_6px_rgba(255,255,255,0.1)]"
            : "bg-transparent text-[#6B7280] hover:text-[#3D4852] hover:shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]",
          needsKey && "!bg-[#F59E0B] !text-white"
        )}
        title="Choose LLM backend"
      >
        {needsKey ? (
          <Zap className="h-3.5 w-3.5" />
        ) : (
          ICONS[backend]
        )}
        <span className="hidden sm:inline">
          {needsKey ? "API key needed" : LABELS[backend]}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] rounded-2xl bg-[#E0E5EC] p-4 shadow-[12px_12px_24px_rgb(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.8)] border border-white/50"
        >
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]">
              <Zap className="h-3.5 w-3.5 text-[#6C63FF]" />
            </div>
            <span className="text-xs font-semibold text-[#3D4852]">LLM Backend</span>
          </div>

          <div className="mb-3 h-px bg-[#B0BEC5]/30 shadow-[0_1px_0_rgba(255,255,255,0.5)]" />

          {/* Option cards */}
          <div className="flex flex-col gap-2.5">
            {/* ── Local Ollama ── */}
            <OptionCard
              active={backend === "ollama"}
              onClick={() => setBackend("ollama")}
              icon={<Cpu className="h-3.5 w-3.5" />}
              headline="Have the hardware? Try local LLMs"
              tagline="Run models privately on your GPU via Ollama — no API costs, no data leaves your machine."
            />

            {/* ── Cloud OpenRouter ── */}
            <OptionCard
              active={backend === "openrouter"}
              onClick={() => setBackend("openrouter")}
              icon={<Cloud className="h-3.5 w-3.5" />}
              headline="Have your own API key? Use here"
              tagline="Connect to OpenRouter for cloud inference — parallel stages, no GPU required."
            >
              {/* Master key */}
              <div className="flex flex-col gap-2">
                <KeyInput
                  label="OpenRouter API key"
                  value={masterKey}
                  onChange={setMasterKey}
                />

                {/* Per-stage keys (advanced) */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1 text-[9px] font-medium text-[#6B7280] hover:text-[#6C63FF] transition-colors"
                >
                  {showAdvanced ? (
                    <ChevronDown className="h-2.5 w-2.5" />
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5" />
                  )}
                  Advanced — per-stage keys for parallel rate limits
                </button>

                {showAdvanced && (
                  <div className="flex flex-col gap-2 rounded-xl bg-[#E0E5EC] p-2 shadow-[inset_2px_2px_4px_rgb(163,177,198,0.5),inset_-2px_-2px_4px_rgba(255,255,255,0.4)]">
                    <p className="text-[9px] text-[#6B7280] leading-relaxed">
                      Each key gets its own rate-limit bucket — create separate accounts at{" "}
                      <span className="font-mono">openrouter.ai</span> for maximum parallel throughput.
                    </p>
                    {(
                      [
                        { group: "reasoning" as const, label: "Reasoning (preprocessing + RAG)", hint: "deepseek-r1" },
                        { group: "coding" as const, label: "Coding (recommender + verifier)", hint: "qwen-coder" },
                        { group: "instruction" as const, label: "Instruction (validator)", hint: "llama" },
                        { group: "summarize" as const, label: "Summarize (reporter)", hint: "mistral" },
                      ]
                    ).map(({ group, label }) => (
                      <KeyInput
                        key={group}
                        label={label}
                        value={groupKeys[group]}
                        onChange={(v) => setGroupKey(group, v)}
                      />
                    ))}
                  </div>
                )}

                <p className="text-[9px] text-[#6B7280]">
                  Keys are stored locally in your browser and sent directly to the backend with each request.
                </p>
              </div>
            </OptionCard>

            {/* ── Server default (Auto) ── */}
            <OptionCard
              active={backend === "auto"}
              onClick={() => setBackend("auto")}
              icon={<Settings2 className="h-3.5 w-3.5" />}
              headline="Use server default"
              tagline="Defer to the backend's configured LLM_BACKEND environment variable."
            />
          </div>
        </div>
      )}
    </div>
  );
}
