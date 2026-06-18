"use client";

import { Activity, Layers, FileDown, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysisStore } from "@/stores/analysis-store";
import { StageProgress } from "./stage-progress";
import { FunctionList } from "./function-list";
import { EventFeed } from "./event-feed";
import { ResultsPanel } from "@/components/results/results-panel";
import { ReportSummary } from "@/components/reports/report-summary";
import { ReportDownload } from "@/components/reports/report-download";

export function AnalysisPanel() {
  const activeTab = useAnalysisStore((s) => s.activeTab);
  const setActiveTab = useAnalysisStore((s) => s.setActiveTab);
  const status = useAnalysisStore((s) => s.status);
  const results = useAnalysisStore((s) => s.results);

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full flex-col bg-[#E0E5EC]"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 items-center bg-[#E0E5EC] px-2 pt-2 shadow-[0_2px_4px_rgb(163,177,198,0.15)]">
        <TabsList className="h-9 gap-1 bg-[#E0E5EC] p-0.5 shadow-[inset_3px_3px_6px_rgb(163,177,198,0.6),inset_-3px_-3px_6px_rgba(255,255,255,0.5)]">
          <TabsTrigger
            value="feed"
            className="flex h-7 items-center gap-1.5 rounded-xl px-3 text-[11px] data-active:text-[#3D4852]"
          >
            {status === "analyzing" ? (
              <Loader2 className="h-3 w-3 animate-spin text-[#6C63FF]" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            Live Feed
          </TabsTrigger>
          <TabsTrigger
            value="results"
            className="flex h-7 items-center gap-1.5 rounded-xl px-3 text-[11px] data-active:text-[#3D4852]"
          >
            <Layers className="h-3 w-3" />
            Results
            {results.length > 0 && (
              <span className="rounded-full bg-[#6C63FF]/15 px-1.5 py-0.5 text-[9px] text-[#6C63FF]">
                {results.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="flex h-7 items-center gap-1.5 rounded-xl px-3 text-[11px] data-active:text-[#3D4852]"
          >
            <FileDown className="h-3 w-3" />
            Export
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Stage progress (visible during/after analysis) */}
      {status !== "idle" && <StageProgress />}

      {/* Function chips */}
      <FunctionList />

      <TabsContent value="feed" className="mt-0 flex-1 overflow-hidden">
        <EventFeed />
      </TabsContent>

      <TabsContent value="results" className="mt-0 flex-1 overflow-hidden">
        <ResultsPanel />
      </TabsContent>

      <TabsContent value="reports" className="mt-0 flex-1 overflow-y-auto">
        {status === "complete" ? (
          <>
            <ReportSummary />
            <ReportDownload />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="text-sm text-[#6B7280]">Reports will be available after analysis completes</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
