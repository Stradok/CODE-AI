"use client";

import { Download, FileJson, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { getReportUrl, getPdfReportUrl } from "@/lib/api";

export function ReportDownload() {
  const jobId = useEditorStore((s) => s.jobId);
  const status = useAnalysisStore((s) => s.status);
  const pdfReady = useAnalysisStore((s) => s.pdfReady);

  if (status !== "complete" || !jobId) return null;

  return (
    <div className="border-t border-border/50 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        Export Reports
      </p>
      <div className="flex flex-col gap-2">
        <a href={getReportUrl(jobId)} download="pipeline_results.json">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-border/60 text-xs hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <FileJson className="h-3.5 w-3.5" />
            JSON Report
            <Download className="ml-auto h-3 w-3 text-muted-foreground" />
          </Button>
        </a>
        {pdfReady && (
          <a href={getPdfReportUrl(jobId)} download="pipeline_report.pdf">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-border/60 text-xs hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF Report
              <Download className="ml-auto h-3 w-3 text-muted-foreground" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
