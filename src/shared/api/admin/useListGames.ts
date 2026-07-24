"use client";

import { useQuery } from "@tanstack/react-query";
import { listGamesAction } from "@/src/shared/actions/admin/manage-games";

export function useListGames() {
  return useQuery({
    queryKey: ["admin", "games"],
    queryFn: listGamesAction,
    staleTime: 0,
  });
}
