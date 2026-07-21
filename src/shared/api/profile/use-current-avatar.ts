"use client";

import { useQuery } from "@tanstack/react-query";
import { getCurrentAvatarAction } from "@/src/shared/actions/profile/get-avatar";

export function useCurrentAvatar() {
  return useQuery({
    queryKey: ["profile", "avatar"],
    queryFn: getCurrentAvatarAction,
    staleTime: 0,
  });
}
