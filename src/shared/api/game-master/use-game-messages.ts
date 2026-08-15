"use client";

import { useQuery } from "@tanstack/react-query";
import { getGameMessagesAction } from "@/src/shared/actions/game-master/get-game-messages";

export function useGameMessages(sessionId: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ["game", "messages", sessionId, page],
    queryFn: () => getGameMessagesAction(sessionId!, page),
    enabled: !!sessionId,
    staleTime: 0,
  });
}
