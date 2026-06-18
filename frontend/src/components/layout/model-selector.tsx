"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, ChevronDown, RotateCcw, Cpu } from "lucide-react";
import { useModelStore, PIPELINE_STAGES } from "@/stores/model-store";
import { getAvailableModels } from "@/lib/api";
import { cn } from "@/lib/utils";

function StageRow({
  label,
  stageKey,
  currentModel,
  defaultModel,
  availableModels,
  onChange,
}: {
  label: string;
  stageKey: string;
  currentModel: string;
  defaultModel: string;
  availableModels: string[];
  onChange: (model: string) => void;
}) {
  const isCustom = currentModel !== defaultModel;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-28 shrink-0">
        <div className="flex items-center gap-1.5">
          {isCustom && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#6C63FF] shrink-0" />
          )}
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
          value={currentModel}
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
          {availableModels.length === 0 ? (
            <option value={currentModel}>{currentModel}</option>
          ) : (
            availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))
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

  const availableModels = useModelStore((s) => s.availableModels);
  const selectedModels = useModelStore((s) => s.selectedModels);
  const loadingModels = useModelStore((s) => s.loadingModels);
  const setAvailableModels = useModelStore((s) => s.setAvailableModels);
  const setLoadingModels = useModelStore((s) => s.setLoadingModels);
  const setStageModel = useModelStore((s) => s.setStageModel);
  const resetToDefaults = useModelStore((s) => s.resetToDefaults);

  const hasCustom = PIPELINE_STAGES.some((s) => {
    const sel = selectedModels[s.key];
    return sel && sel !== s.defaultModel;
  });

  // Fetch models on first open
  useEffect(() => {
    if (!open || availableModels.length > 0) return;
    setLoadingModels(true);
    getAvailableModels()
      .then((r) => setAvailableModels(r.models))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [open, availableModels.length, setAvailableModels, setLoadingModels]);

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
            {PIPELINE_STAGES.filter((s) => selectedModels[s.key] && selectedModels[s.key] !== s.defaultModel).length}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-2xl bg-[#E0E5EC] p-4 shadow-[12px_12px_24px_rgb(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.8)] border border-white/50"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E0E5EC] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]">
                <Cpu className="h-3.5 w-3.5 text-[#6C63FF]" />
              </div>
              <span className="text-xs font-semibold text-[#3D4852]">Pipeline Models</span>
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

          {/* Divider */}
          <div className="mb-3 h-px bg-[#B0BEC5]/30 shadow-[0_1px_0_rgba(255,255,255,0.5)]" />

          {/* Stage rows */}
          {loadingModels ? (
            <div className="flex items-center justify-center py-6 gap-2 text-[11px] text-[#6B7280]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6C63FF] border-t-transparent" />
              Loading models…
            </div>
          ) : (
            <div className="divide-y divide-[#B0BEC5]/20">
              {PIPELINE_STAGES.map((stage) => {
                const current = selectedModels[stage.key] ?? stage.defaultModel;
                const models = availableModels.length > 0
                  ? availableModels
                  : [stage.defaultModel];
                return (
                  <StageRow
                    key={stage.key}
                    stageKey={stage.key}
                    label={stage.label}
                    currentModel={current}
                    defaultModel={stage.defaultModel}
                    availableModels={models}
                    onChange={(m) => setStageModel(stage.key, m)}
                  />
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          <div className="mt-3 rounded-xl bg-[#E0E5EC] px-3 py-2 shadow-[inset_2px_2px_4px_rgb(163,177,198,0.5),inset_-2px_-2px_4px_rgba(255,255,255,0.4)]">
            <p className="text-[9px] text-[#6B7280] leading-relaxed">
              Changes apply to the next analysis run. Highlighted stages use non-default models.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
