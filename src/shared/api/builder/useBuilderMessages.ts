"use client";

import { useQuery } from "@tanstack/react-query";
import { getBuilderMessagesAction } from "@/src/shared/actions/builder/get-messages";

export function useBuilderMessages(sessionId: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ["builder", "messages", sessionId, page],
    queryFn: () => getBuilderMessagesAction(sessionId!, page),
    enabled: !!sessionId,
    staleTime: 0,
  });
}
