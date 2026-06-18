"use client";

import { Toolbar } from "@/components/layout/toolbar";
import { IdeLayout } from "@/components/layout/ide-layout";
import { StatusBar } from "@/components/layout/status-bar";

export default function Home() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar />
      <IdeLayout />
      <StatusBar />
    </div>
  );
}
