"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGameAction } from "@/src/shared/actions/admin/manage-games";

export function useCreateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGameAction(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
    },
  });
}
