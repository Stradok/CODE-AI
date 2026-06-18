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
      className="flex h-full flex-col"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-border bg-muted/20 px-2">
        <TabsList className="h-8 gap-0.5 bg-transparent p-0">
          <TabsTrigger
            value="feed"
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {status === "analyzing" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            Live Feed
          </TabsTrigger>
          <TabsTrigger
            value="results"
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Layers className="h-3 w-3" />
            Results
            {results.length > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">
                {results.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
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
          <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
            <p className="text-sm">Reports will be available after analysis completes</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
