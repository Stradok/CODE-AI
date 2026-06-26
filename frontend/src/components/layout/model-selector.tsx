"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, ChevronDown, RotateCcw, Cpu, Cloud, Search, Tag } from "lucide-react";
import { useModelStore, PIPELINE_STAGES } from "@/stores/model-store";
import { useBackendStore } from "@/stores/backend-store";
import { getAvailableModels } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ORModel {
  id: string;
  name: string;
  isFree: boolean;
  provider: string;
}

function StageRow({
  label,
  currentModel,
  defaultModel,
  ollamaModels,
  orModels,
  isOrMode,
  onChange,
}: {
  label: string;
  currentModel: string;
  defaultModel: string;
  ollamaModels: string[];
  orModels: ORModel[];
  isOrMode: boolean;
  onChange: (model: string) => void;
}) {
  // In OR mode: if stored value is an Ollama name (no "/"), fall back to OR default
  const effectiveModel = isOrMode && !currentModel.includes("/")
    ? defaultModel   // defaultModel has been set to defaultOpenRouterModel by caller
    : currentModel;

  const isCustom = isOrMode
    ? currentModel.includes("/")   // any explicit OR model ID = custom
    : currentModel !== defaultModel;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-28 shrink-0">
        <div className="flex items-center gap-1.5">
          {isCustom && <span className="h-1.5 w-1.5 rounded-full bg-[#6C63FF] shrink-0" />}
          <span className={cn(
            "text-[11px] font-medium truncate",
            isCustom ? "text-[#6C63FF]" : "text-[#3D4852]"
          )}>
            {label}
          </span>
        </div>
      </div>

      <div className="relative flex-1">
        <select
          value={effectiveModel}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-xl px-3 py-1.5 pr-7 text-[11px] font-mono",
            "bg-[#E0E5EC] text-[#3D4852] outline-none cursor-pointer",
            "shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
            "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC]",
            "transition-all duration-200",
            isCustom && "text-[#6C63FF]"
          )}
        >
          {isOrMode ? (
            orModels.length === 0 ? (
              <option value={effectiveModel}>{effectiveModel}</option>
            ) : (
              orModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.isFree ? " · free" : ""}
                </option>
              ))
            )
          ) : (
            ollamaModels.length === 0 ? (
              <option value={effectiveModel}>{effectiveModel}</option>
            ) : (
              ollamaModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))
            )
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#6B7280]" />
      </div>
    </div>
  );
}

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Ollama state
  const availableModels = useModelStore((s) => s.availableModels);
  const selectedModels = useModelStore((s) => s.selectedModels);
  const loadingModels = useModelStore((s) => s.loadingModels);
  const setAvailableModels = useModelStore((s) => s.setAvailableModels);
  const setLoadingModels = useModelStore((s) => s.setLoadingModels);
  const setStageModel = useModelStore((s) => s.setStageModel);
  const resetToDefaults = useModelStore((s) => s.resetToDefaults);

  // Backend mode
  const backend = useBackendStore((s) => s.backend);
  const isOrMode = backend === "openrouter";

  // OpenRouter state
  const [orModels, setOrModels] = useState<ORModel[]>([]);
  const [loadingOr, setLoadingOr] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const [search, setSearch] = useState("");

  // Fetch Ollama models on first open (non-OR mode)
  useEffect(() => {
    if (!open || isOrMode || availableModels.length > 0) return;
    setLoadingModels(true);
    getAvailableModels()
      .then((r) => setAvailableModels(r.models))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [open, isOrMode, availableModels.length, setAvailableModels, setLoadingModels]);

  // Fetch OpenRouter models on first open (OR mode) — public endpoint, no auth needed
  useEffect(() => {
    if (!open || !isOrMode || orModels.length > 0) return;
    setLoadingOr(true);
    fetch("https://openrouter.ai/api/v1/models")
      .then((r) => r.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models: ORModel[] = (data.data ?? []).map((m: any) => ({
          id: m.id as string,
          name: (m.name as string) ?? (m.id as string),
          isFree: m.pricing?.prompt === "0" && m.pricing?.completion === "0",
          provider: (m.id as string).split("/")[0] ?? "",
        }));
        // Free first, then alphabetical by name
        models.sort((a, b) => {
          if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setOrModels(models);
      })
      .catch(() => {})
      .finally(() => setLoadingOr(false));
  }, [open, isOrMode, orModels.length]);

  const filteredOrModels = useMemo(() => {
    let list = orModels;
    if (freeOnly) list = list.filter((m) => m.isFree);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orModels, freeOnly, search]);

  const hasCustom = PIPELINE_STAGES.some((s) => {
    const sel = selectedModels[s.key];
    return isOrMode ? !!(sel?.includes("/")) : !!(sel && sel !== s.defaultModel);
  });

  const customCount = PIPELINE_STAGES.filter((s) => {
    const sel = selectedModels[s.key];
    return isOrMode ? !!(sel?.includes("/")) : !!(sel && sel !== s.defaultModel);
  }).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isLoading = isOrMode ? loadingOr : loadingModels;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl h-8 px-3 text-xs",
          "transition-all duration-300 ease-out outline-none select-none",
          open || hasCustom
            ? "bg-[#6C63FF] text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2),inset_-3px_-3px_6px_rgba(255,255,255,0.1)]"
            : "bg-transparent text-[#6B7280] hover:text-[#3D4852] hover:shadow-[5px_5px_10px_rgb(163,177,198,0.6),-5px_-5px_10px_rgba(255,255,255,0.5)]"
        )}
        title="Configure models per stage"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Models</span>
        {hasCustom && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[9px] font-bold">
            {customCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-96 rounded-2xl bg-[#E0E5EC] p-4 shadow-[12px_12px_24px_rgb(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.8)] border border-white/50"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]">
                {isOrMode
                  ? <Cloud className="h-3.5 w-3.5 text-[#6C63FF]" />
                  : <Cpu className="h-3.5 w-3.5 text-[#6C63FF]" />}
              </div>
              <div>
                <span className="text-xs font-semibold text-[#3D4852]">Pipeline Models</span>
                {isOrMode && orModels.length > 0 && (
                  <span className="ml-2 text-[9px] text-[#6C63FF]">
                    {filteredOrModels.length} / {orModels.length} models
                  </span>
                )}
              </div>
            </div>
            {hasCustom && (
              <button
                type="button"
                onClick={resetToDefaults}
                className="flex items-center gap-1 text-[10px] text-[#6B7280] hover:text-[#DC2626] transition-colors"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Reset
              </button>
            )}
          </div>

          {/* OpenRouter search + free filter */}
          {isOrMode && (
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#6B7280]" />
                <input
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(
                    "w-full rounded-xl py-1.5 pl-7 pr-3 text-[11px]",
                    "bg-[#E0E5EC] text-[#3D4852] outline-none placeholder:text-[#9CA3AF]",
                    "shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]",
                    "focus:ring-2 focus:ring-[#6C63FF] focus:ring-offset-1 focus:ring-offset-[#E0E5EC]"
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => setFreeOnly((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap transition-all",
                  freeOnly
                    ? "bg-[#6C63FF] text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]"
                    : "text-[#6B7280] shadow-[3px_3px_6px_rgb(163,177,198,0.6),-3px_-3px_6px_rgba(255,255,255,0.5)]"
                )}
              >
                <Tag className="h-2.5 w-2.5" />
                Free only
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="mb-3 h-px bg-[#B0BEC5]/30 shadow-[0_1px_0_rgba(255,255,255,0.5)]" />

          {/* Stage rows */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-[11px] text-[#6B7280]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6C63FF] border-t-transparent" />
              {isOrMode ? "Fetching OpenRouter models…" : "Loading models…"}
            </div>
          ) : (
            <div className="divide-y divide-[#B0BEC5]/20">
              {PIPELINE_STAGES.map((stage) => {
                const current = selectedModels[stage.key] ?? stage.defaultModel;
                const orDefault = stage.defaultOpenRouterModel;

                // Fallback OR list for when filters produce zero results
                const orFallback: ORModel[] = [{
                  id: orDefault,
                  name: orDefault,
                  isFree: true,
                  provider: orDefault.split("/")[0],
                }];

                return (
                  <StageRow
                    key={stage.key}
                    label={stage.label}
                    currentModel={current}
                    defaultModel={isOrMode ? orDefault : stage.defaultModel}
                    ollamaModels={
                      availableModels.length > 0 ? availableModels : [stage.defaultModel]
                    }
                    orModels={filteredOrModels.length > 0 ? filteredOrModels : (orModels.length > 0 ? orModels : orFallback)}
                    isOrMode={isOrMode}
                    onChange={(m) => setStageModel(stage.key, m)}
                  />
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 rounded-xl bg-[#E0E5EC] px-3 py-2 shadow-[inset_2px_2px_4px_rgb(163,177,198,0.5),inset_-2px_-2px_4px_rgba(255,255,255,0.4)]">
            <p className="text-[9px] text-[#6B7280] leading-relaxed">
              {isOrMode
                ? "Pick any model per stage — it goes directly to OpenRouter. Purple dot = you overrode the default."
                : "Changes apply to the next run. Purple dot = overridden from server default."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
