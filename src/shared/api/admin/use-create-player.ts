"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPlayerAction } from "@/src/shared/actions/admin/create-player";

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ login, password }: { login: string; password: string }) => createPlayerAction(login, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
