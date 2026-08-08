"use client";

import { useQuery } from "@tanstack/react-query";
import { getGameSessionAction } from "@/src/shared/actions/game-master/get-game-session";

export function useGameSession() {
  return useQuery({
    queryKey: ["game", "session"],
    queryFn: getGameSessionAction,
    staleTime: Infinity,
  });
}
