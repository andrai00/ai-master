"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserAvatarAction } from "@/src/shared/actions/profile/get-user-avatar";

export function useUserAvatar(userId?: string) {
  return useQuery({
    queryKey: ["avatar", userId],
    queryFn: () => getUserAvatarAction(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
