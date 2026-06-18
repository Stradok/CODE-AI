"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { useEditorStore } from "@/stores/editor-store";
import { toast } from "sonner";

interface FileDropZoneProps {
  children: React.ReactNode;
}

export function FileDropZone({ children }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const setFile = useEditorStore((s) => s.setFile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".py")) {
        toast.error("Only Python (.py) files are supported");
        return;
      }

      try {
        const result = await uploadFile(file);
        setFile(result.filename, result.code, result.job_id);
        toast.success(`Uploaded ${result.filename}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Upload failed"
        );
      }
    },
    [setFile]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      className="relative h-full"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".py"
        className="hidden"
        onChange={onFileSelect}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary p-8">
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium text-primary">
              Drop your .py file here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function useFileInput() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trigger = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return { fileInputRef, trigger };
}
