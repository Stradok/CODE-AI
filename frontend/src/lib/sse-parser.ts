import type { SSEEvent, SSEEventType } from "@/types/events";

/**
 * Stateful SSE parser that buffers incomplete chunks and emits
 * complete event/data pairs. Handles the standard SSE format:
 *   event: <name>\ndata: <json>\n\n
 */
export class SSEParser {
  private buffer = "";

  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];

    // Split on double newline (event boundary)
    const parts = this.buffer.split("\n\n");

    // Last part may be incomplete — keep it in the buffer
    this.buffer = parts.pop() ?? "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      let eventType: SSEEventType = "connected";
      let dataStr = "";

      for (const line of trimmed.split("\n")) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim() as SSEEventType;
        } else if (line.startsWith("data:")) {
          dataStr += line.slice(5).trim();
        }
      }

      if (!dataStr) continue;

      try {
        const data = JSON.parse(dataStr);
        events.push({
          type: eventType,
          data,
          timestamp: new Date(),
        });
      } catch {
        // Skip malformed JSON
      }
    }

    return events;
  }

  reset() {
    this.buffer = "";
  }
}
