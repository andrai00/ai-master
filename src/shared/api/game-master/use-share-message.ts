"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { shareMessageAction } from "@/src/shared/actions/game-master/share-message";

export function useShareMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => shareMessageAction(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", "messages"] });
    },
  });
}
