"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendBuilderMessageAction } from "@/src/shared/actions/builder/send-message";

export function useSendBuilderMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      sendBuilderMessageAction(sessionId, content),
    onSuccess: (result, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["builder", "messages", sessionId] });
      if ("summarized" in result && result.summarized) {
        qc.invalidateQueries({ queryKey: ["admin", "games"] });
      }
    },
  });
}
