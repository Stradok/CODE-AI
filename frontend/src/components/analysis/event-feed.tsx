"use client";

import { useEffect, useRef } from "react";
import { Loader2, Radio } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnalysisStore } from "@/stores/analysis-store";
import { EventFeedItem } from "./event-feed-item";

export function EventFeed() {
  const events = useAnalysisStore((s) => s.events);
  const status = useAnalysisStore((s) => s.status);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center bg-[#E0E5EC]">
        {status === "analyzing" ? (
          <>
            <div className="relative">
              <Radio className="h-7 w-7 text-[#6B7280]/30" />
              <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-[#6C63FF]" />
            </div>
            <p className="text-sm text-[#6B7280]">
              Connecting to analysis stream…
            </p>
          </>
        ) : (
          <>
            <Radio className="h-7 w-7 text-[#6B7280]/20" />
            <p className="text-sm text-[#6B7280]">
              Live events will stream here during analysis
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {events.map((event, i) => (
          <EventFeedItem key={i} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
