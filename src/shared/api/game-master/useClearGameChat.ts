"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearGameChatAction } from "@/src/shared/actions/game-master/clear-game-chat";

export function useClearGameChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => clearGameChatAction(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", "messages"] });
      qc.invalidateQueries({ queryKey: ["game", "rolls"] });
    },
  });
}
