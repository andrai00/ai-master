"use client";

import { useQuery } from "@tanstack/react-query";
import { testAiConnectionAction } from "@/src/shared/actions/admin/test-ai-connection";

export function useModelList(
  provider: string,
  baseUrl: string,
  apiKey: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["ai", "models", provider, baseUrl, apiKey],
    queryFn: () => testAiConnectionAction(provider, baseUrl, apiKey),
    enabled: enabled && !!apiKey,
    staleTime: 5 * 60_000,
  });
}
