"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteGameAction, deleteGameWithInfoAction } from "@/src/shared/actions/admin/games";

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const info = await deleteGameWithInfoAction(id);
      if (!info.success) throw new Error(info.error);
      return deleteGameAction(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
    },
  });
}
