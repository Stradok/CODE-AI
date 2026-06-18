"use client";

import dynamic from "next/dynamic";
import { useEditorStore } from "@/stores/editor-store";
import { Skeleton } from "@/components/ui/skeleton";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#E0E5EC]">
      <Skeleton className="h-[80%] w-[90%] rounded-2xl" />
    </div>
  ),
});

export function CodeEditor() {
  const code = useEditorStore((s) => s.code);
  const setCode = useEditorStore((s) => s.setCode);

  return (
    <MonacoEditor
      height="100%"
      language="python"
      theme="vs"
      value={code}
      onChange={(value) => setCode(value ?? "")}
      options={{
        fontSize: 13,
        fontFamily: "var(--font-geist-mono), monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        lineNumbers: "on",
        renderLineHighlight: "none",
        wordWrap: "on",
        automaticLayout: true,
      }}
    />
  );
}
