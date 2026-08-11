"use client";

import { useQuery } from "@tanstack/react-query";
import { getPlayerDocumentsAction } from "@/src/shared/actions/game-master/get-player-documents";

export function usePlayerDocuments() {
  return useQuery({
    queryKey: ["game", "playerDocuments"],
    queryFn: getPlayerDocumentsAction,
    staleTime: 30_000,
  });
}
