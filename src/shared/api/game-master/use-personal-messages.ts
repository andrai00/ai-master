"use client";

import { useQuery } from "@tanstack/react-query";
import { getPersonalMessagesAction } from "@/src/shared/actions/game-master/get-personal-messages";

export function usePersonalMessages(sessionId: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ["personal", "messages", sessionId, page],
    queryFn: () => getPersonalMessagesAction(sessionId!, page),
    enabled: !!sessionId,
    staleTime: 0,
  });
}
