"use client";

import dynamic from "next/dynamic";

const ReactDiffViewer = dynamic(() => import("react-diff-viewer-continued"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-xs text-muted-foreground">Loading diff...</div>
  ),
});

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
}

export function DiffViewer({ oldCode, newCode }: DiffViewerProps) {
  return (
    <div className="overflow-x-auto text-xs [&_pre]:!text-xs [&_td]:!text-xs">
      <ReactDiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={false}
        useDarkTheme={true}
        hideLineNumbers={false}
        styles={{
          contentText: {
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
          },
        }}
      />
    </div>
  );
}
