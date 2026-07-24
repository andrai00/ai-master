"use client";

import { useQuery } from "@tanstack/react-query";
import { getActiveModeAction } from "@/src/shared/actions/admin/set-master-mode";

export function useActiveMode() {
  return useQuery({
    queryKey: ["admin", "activeMode"],
    queryFn: getActiveModeAction,
    staleTime: 0,
  });
}
