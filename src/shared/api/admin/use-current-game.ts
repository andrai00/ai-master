"use client";

import { useQuery } from "@tanstack/react-query";
import { listGamesAction, getCurrentGameAction } from "@/src/shared/actions/admin/games";

export function useCurrentGame() {
  return useQuery({
    queryKey: ["admin", "currentGame"],
    queryFn: async () => {
      const [list, current] = await Promise.all([listGamesAction(), getCurrentGameAction()]);
      const found = list.find((g) => g.id === current?.id);
      return { id: current?.id || null, name: found?.name || current?.name || "" };
    },
    staleTime: Infinity,
  });
}
