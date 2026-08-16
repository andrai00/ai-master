"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserGameAccessAction } from "@/src/shared/actions/admin/manage-game-access";

export function useUserGameAccess(userId: string | null) {
  return useQuery({
    queryKey: ["admin", "access", userId],
    queryFn: () => getUserGameAccessAction(userId!),
    enabled: !!userId,
  });
}
