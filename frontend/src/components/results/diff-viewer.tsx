"use client";

import dynamic from "next/dynamic";

const ReactDiffViewer = dynamic(() => import("react-diff-viewer-continued"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-xs text-[#6B7280]">Loading diff...</div>
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
        useDarkTheme={false}
        hideLineNumbers={false}
        styles={{
          contentText: {
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
          },
          diffContainer: {
            background: "#E0E5EC",
          },
          gutter: {
            background: "#E0E5EC",
          },
          line: {
            background: "#E0E5EC",
          },
          titleBlock: {
            background: "#D1D9E6",
          },
        }}
      />
    </div>
  );
}
