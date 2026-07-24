"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateGameAction } from "@/src/shared/actions/admin/manage-games";

export function useUpdateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateGameAction(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
    },
  });
}
