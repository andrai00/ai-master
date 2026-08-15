"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteGameMessageAction } from "@/src/shared/actions/game-master/delete-game-message";

export function useDeleteGameMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteGameMessageAction(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", "messages"] });
    },
  });
}
