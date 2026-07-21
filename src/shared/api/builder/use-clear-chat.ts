"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearBuilderChatAction } from "@/src/shared/actions/builder/clear-chat";

export function useClearBuilderChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => clearBuilderChatAction(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builder", "messages"] });
    },
  });
}
