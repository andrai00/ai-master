"use client";

import { useQuery } from "@tanstack/react-query";
import { getPersonalSessionAction } from "@/src/shared/actions/game-master/get-personal-session";

export function usePersonalSession() {
  return useQuery({
    queryKey: ["personal", "session"],
    queryFn: getPersonalSessionAction,
    staleTime: Infinity,
  });
}
