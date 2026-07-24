"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteGameAction } from "@/src/shared/actions/admin/manage-games";

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteGameAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
    },
  });
}
