"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CallbackInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setStatus("error");
      return;
    }

    fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data: { key?: string }) => {
        if (data.key) {
          // Send key to the opener window and close the popup
          window.opener?.postMessage(
            { type: "openrouter-key", key: data.key },
            window.location.origin
          );
          setStatus("ok");
          setTimeout(() => window.close(), 800);
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E0E5EC]">
      <div className="rounded-2xl bg-[#E0E5EC] p-8 shadow-[12px_12px_24px_rgb(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.8)] text-center max-w-xs">
        {status === "pending" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#6C63FF] border-t-transparent" />
            <p className="text-sm font-medium text-[#3D4852]">Connecting to OpenRouter…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#6C63FF]">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#3D4852]">Connected! Closing…</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-sm font-medium text-[#DC2626]">Connection failed.</p>
            <p className="mt-1 text-xs text-[#6B7280]">Close this window and try again.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
