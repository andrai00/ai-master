"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearPersonalChatAction } from "@/src/shared/actions/game-master/clear-personal-chat";

export function useClearPersonalChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => clearPersonalChatAction(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal", "messages"] });
      qc.invalidateQueries({ queryKey: ["personal", "rolls"] });
    },
  });
}
