"use client";

import { useQuery } from "@tanstack/react-query";
import { getAgentTranscriptAction } from "@/src/shared/actions/agents/get-agent-transcript";

/**
 * Agent internals for the debug UI. The server returns { error } unless
 * AGENT_DEBUG=1 is set — the query simply stays empty for everyone else.
 */
export function useAgentTranscript(sessionId?: string) {
  return useQuery({
    queryKey: ["agent", "transcript", sessionId],
    queryFn: () => getAgentTranscriptAction(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
