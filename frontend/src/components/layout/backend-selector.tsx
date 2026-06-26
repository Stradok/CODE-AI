"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Cpu, Cloud, KeyRound, Eye, EyeOff, Zap, LogIn, CheckCircle2, ChevronDown,
} from "lucide-react";
import {
  useBackendStore,
  detectProvider,
  PROVIDER_KEY_LABELS,
  type LLMBackend,
} from "@/stores/backend-store";
import { PIPELINE_STAGES } from "@/stores/model-store";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/types/api";

// ---------------------------------------------------------------------------
// OpenRouter OAuth helper
// ---------------------------------------------------------------------------

async function openRouterOAuth(): Promise<string | null> {
  const callbackUrl = `${window.location.origin}/auth/callback`;
  const popup = window.open(
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}`,
    "openrouter-auth",
    "width=500,height=680,resizable=yes,scrollbars=yes,noopener=no"
  );
  if (!popup) return null;

  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "openrouter-key") {
        window.removeEventListener("message", handler);
        resolve(e.data.key as string);
      }
    };
    window.addEventListener("message", handler);
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 5 * 60 * 1000);
  });
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function OptionCard({
  active, onClick, icon, headline, tagline, children,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  headline: string; tagline: string; children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl p-3 transition-all duration-200",
        active
          ? "bg-[#E0E5EC] shadow-[inset_4px_4px_8px_rgb(163,177,198,0.7),inset_-4px_-4px_8px_rgba(255,255,255,0.6)]"
          : "bg-[#E0E5EC] shadow-[6px_6px_12px_rgb(163,177,198,0.6),-6px_-6px_12px_rgba(255,255,255,0.7)]"
      )}
    >
      <button type="button" onClick={onClick} className="w-full text-left outline-none">
        <div className="flex items-start gap-3">
          {/* Radio dot */}
          <div className="mt-0.5 shrink-0">
            <div className={cn(
              "h-4 w-4 rounded-full border-2 transition-all",
              active ? "border-[#6C63FF] bg-[#6C63FF] shadow-[0_0_0_2px_rgba(108,99,255,0.2)]"
                : "border-[#B0BEC5] bg-transparent"
            )}>
              {active && <div className="m-auto mt-[3px] h-[6px] w-[6px] rounded-full bg-white" />}
            </div>
          </div>
          {/* Icon */}
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-all",
            active
              ? "bg-[#6C63FF] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]"
              : "bg-[#E0E5EC] shadow-[3px_3px_6px_rgb(163,177,198,0.5),-3px_-3px_6px_rgba(255,255,255,0.6)]"
          )}>
            <div className={active ? "text-white" : "text-[#6B7280]"}>{icon}</div>
          </div>
          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className={cn("text-[11px] font-bold uppercase tracking-wide", active ? "text-[#6C63FF]" : "text-[#3D4852]")}>
              {headline}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[#6B7280]">{tagline}</p>
          </div>
        </div>
      </button>

      {active && children && (
        <div className="mt-3 ml-[52px]" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

function SecretInput({
  label, value, onChange, placeholder = "sk-…",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[9px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</label>
      )}
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
            "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC] transition-all"
          )}
        />
        <button type="button" onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#3D4852] transition-colors" tabIndex={-1}>
          {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OpenRouter card content
// ---------------------------------------------------------------------------

function OpenRouterContent() {
  const orKey = useBackendStore((s) => s.orKey);
  const orConnected = useBackendStore((s) => s.orConnected);
  const setOrKey = useBackendStore((s) => s.setOrKey);
  const [connecting, setConnecting] = useState(false);

  const handleOAuth = async () => {
    setConnecting(true);
    const key = await openRouterOAuth();
    setConnecting(false);
    if (key) setOrKey(key, true);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {orConnected && orKey ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.5),inset_-2px_-2px_4px_rgba(255,255,255,0.4)]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0" />
          <span className="text-[10px] font-medium text-[#3D4852]">Connected to OpenRouter</span>
          <button type="button" onClick={() => setOrKey("", false)}
            className="ml-auto text-[9px] text-[#6B7280] hover:text-[#DC2626] transition-colors">
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={handleOAuth} disabled={connecting}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold transition-all",
              "bg-[#6C63FF] text-white shadow-[4px_4px_8px_rgb(163,177,198,0.5),-4px_-4px_8px_rgba(255,255,255,0.5)]",
              "hover:shadow-[6px_6px_12px_rgb(163,177,198,0.6),-6px_-6px_12px_rgba(255,255,255,0.6)]",
              "active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] disabled:opacity-60"
            )}>
            {connecting
              ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <LogIn className="h-3.5 w-3.5" />}
            {connecting ? "Opening OpenRouter…" : "Sign in with OpenRouter"}
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-[#B0BEC5]/40" />
            <span className="text-[9px] text-[#9CA3AF]">or paste key manually</span>
            <div className="flex-1 h-px bg-[#B0BEC5]/40" />
          </div>

          <SecretInput
            label=""
            value={orKey}
            onChange={(v) => setOrKey(v, false)}
            placeholder="sk-or-v1-…"
          />
        </>
      )}
      <p className="text-[9px] text-[#6B7280] leading-relaxed">
        Free account at openrouter.ai — use any model, free or paid, across all pipeline stages.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom per-stage card content
// ---------------------------------------------------------------------------

interface ORModel { id: string; name: string; provider: string }

function CustomStageRow({
  stage, label,
}: {
  stage: PipelineStage; label: string;
}) {
  const cfg = useBackendStore((s) => s.stageConfigs[stage]);
  const setStageConfig = useBackendStore((s) => s.setStageConfig);

  const model = cfg?.model ?? "";
  const apiKey = cfg?.apiKey ?? "";
  const provider = detectProvider(model);
  const keyLabel = PROVIDER_KEY_LABELS[provider];

  const [showKey, setShowKey] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-[#B0BEC5]/20 last:border-0">
      <div className="flex items-center gap-1.5">
        <span className={cn(
          "text-[10px] font-semibold w-24 shrink-0",
          (model || apiKey) ? "text-[#6C63FF]" : "text-[#3D4852]"
        )}>
          {label}
        </span>
        {provider !== "openrouter" && (
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide",
            provider === "openai" ? "bg-[#10B981]/15 text-[#059669]" : "bg-[#F59E0B]/15 text-[#D97706]"
          )}>
            {provider}
          </span>
        )}
      </div>

      {/* Model input with datalist */}
      <div className="relative">
        <input
          type="text"
          value={model}
          onChange={(e) => setStageConfig(stage, e.target.value, apiKey)}
          placeholder="openai/gpt-4o  or  anthropic/claude-3-5-sonnet-20241022"
          spellCheck={false}
          className={cn(
            "w-full rounded-xl py-1.5 pl-2.5 pr-7 font-mono text-[10px] text-[#3D4852]",
            "bg-[#E0E5EC] outline-none placeholder:text-[#C4C9D0]",
            "shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
            "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC] transition-all"
          )}
        />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF]" />
      </div>

      {/* API key for this stage */}
      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setStageConfig(stage, model, e.target.value)}
          placeholder={keyLabel}
          spellCheck={false}
          className={cn(
            "w-full rounded-xl py-1.5 pl-2.5 pr-8 font-mono text-[10px] text-[#3D4852]",
            "bg-[#E0E5EC] outline-none placeholder:text-[#C4C9D0]",
            "shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
            "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC] transition-all"
          )}
        />
        <button type="button" onClick={() => setShowKey((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#3D4852] transition-colors" tabIndex={-1}>
          {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function CustomContent() {
  const resetCustom = useBackendStore((s) => s.resetCustom);
  const stageConfigs = useBackendStore((s) => s.stageConfigs);
  const configuredCount = Object.values(stageConfigs).filter((c) => c?.model || c?.apiKey).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-[#6B7280]">
          Set model + API key independently for each pipeline stage.
        </p>
        {configuredCount > 0 && (
          <button type="button" onClick={resetCustom}
            className="text-[9px] text-[#6B7280] hover:text-[#DC2626] transition-colors shrink-0 ml-2">
            Clear all
          </button>
        )}
      </div>

      <div className="rounded-xl bg-[#E0E5EC] px-2 shadow-[inset_2px_2px_5px_rgb(163,177,198,0.5),inset_-2px_-2px_5px_rgba(255,255,255,0.4)]">
        {PIPELINE_STAGES.map((s) => (
          <CustomStageRow key={s.key} stage={s.key} label={s.label} />
        ))}
      </div>

      <p className="text-[9px] text-[#6B7280] leading-relaxed mt-1">
        <span className="font-medium text-[#10B981]">openai/</span> models use your OpenAI key.{" "}
        <span className="font-medium text-[#F59E0B]">anthropic/</span> models use your Anthropic key.
        Everything else goes through OpenRouter.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BackendSelector() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const backend = useBackendStore((s) => s.backend);
  const orKey = useBackendStore((s) => s.orKey);
  const orConnected = useBackendStore((s) => s.orConnected);
  const stageConfigs = useBackendStore((s) => s.stageConfigs);
  const setBackend = useBackendStore((s) => s.setBackend);

  const configuredStages = Object.values(stageConfigs).filter((c) => c?.model || c?.apiKey).length;

  const needsAttention =
    (backend === "openrouter" && !orKey) ||
    (backend === "custom" && configuredStages === 0);

  const LABEL: Record<LLMBackend, string> = {
    auto: "Auto",
    ollama: "Local GPU",
    openrouter: orConnected ? "OpenRouter ✓" : "OpenRouter",
    custom: configuredStages > 0 ? `Custom (${configuredStages})` : "Custom",
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl h-8 px-3 text-xs",
          "transition-all duration-300 ease-out outline-none select-none",
          needsAttention
            ? "bg-[#F59E0B] text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.15)]"
            : open || backend !== "auto"
            ? "bg-[#6C63FF] text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2),inset_-3px_-3px_6px_rgba(255,255,255,0.1)]"
            : "bg-transparent text-[#6B7280] hover:text-[#3D4852] hover:shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]"
        )}
        title="Choose LLM backend"
      >
        {needsAttention ? <Zap className="h-3.5 w-3.5" /> :
          backend === "ollama" ? <Cpu className="h-3.5 w-3.5" /> :
          backend === "openrouter" ? <Cloud className="h-3.5 w-3.5" /> :
          backend === "custom" ? <KeyRound className="h-3.5 w-3.5" /> :
          <Zap className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">
          {needsAttention ? "Setup needed" : LABEL[backend]}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] rounded-2xl bg-[#E0E5EC] p-4 shadow-[12px_12px_24px_rgb(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.8)] border border-white/50"
        >
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]">
              <Zap className="h-3.5 w-3.5 text-[#6C63FF]" />
            </div>
            <span className="text-xs font-semibold text-[#3D4852]">LLM Backend</span>
          </div>
          <div className="mb-3 h-px bg-[#B0BEC5]/30 shadow-[0_1px_0_rgba(255,255,255,0.5)]" />

          <div className="flex flex-col gap-2.5">

            {/* ── 1. OpenRouter ── */}
            <OptionCard
              active={backend === "openrouter"}
              onClick={() => setBackend("openrouter")}
              icon={<Cloud className="h-3.5 w-3.5" />}
              headline="OpenRouter — any model, free or paid"
              tagline="Sign in once with Google. Pick GPT-4o, Claude, Llama — same UI for all."
            >
              <OpenRouterContent />
            </OptionCard>

            {/* ── 2. Local Ollama ── */}
            <OptionCard
              active={backend === "ollama"}
              onClick={() => setBackend("ollama")}
              icon={<Cpu className="h-3.5 w-3.5" />}
              headline="Local GPU — private, no API costs"
              tagline="Run models on your own machine via Ollama. Zero data leaves your PC."
            />

            {/* ── 3. Custom per stage ── */}
            <OptionCard
              active={backend === "custom"}
              onClick={() => setBackend("custom")}
              icon={<KeyRound className="h-3.5 w-3.5" />}
              headline="Custom — different API key per stage"
              tagline="Use your OpenAI key for RAG, Anthropic key for code fixes, etc."
            >
              <CustomContent />
            </OptionCard>

          </div>
        </div>
      )}
    </div>
  );
}
