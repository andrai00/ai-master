"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfileAction } from "@/src/shared/actions/profile/update-profile";

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, avatar }: { name: string; avatar: string }) => updateProfileAction(name, avatar),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "currentGame"] }),
  });
}
