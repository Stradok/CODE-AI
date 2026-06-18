"use client";

import { useState, useEffect, useCallback } from "react";
import { checkHealth } from "@/lib/api";

interface HealthState {
  status: string;
  ollama: boolean;
  error: boolean;
  loading: boolean;
}

export function useHealthCheck(intervalMs = 15000): HealthState {
  const [state, setState] = useState<HealthState>({
    status: "",
    ollama: false,
    error: false,
    loading: true,
  });

  const poll = useCallback(async () => {
    try {
      const data = await checkHealth();
      setState({
        status: data.status,
        ollama: data.ollama,
        error: false,
        loading: false,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        error: true,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    poll();
    // Poll less frequently when backend is offline to reduce console noise
    const id = setInterval(poll, state.error ? intervalMs * 2 : intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs, state.error]);

  return state;
}
