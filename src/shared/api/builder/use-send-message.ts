"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendBuilderMessageAction } from "@/src/shared/actions/builder/send-message";
import type { IBuilderMessagesResult, IBuilderMessage } from "@/src/shared/actions/builder/get-messages";

export function useSendBuilderMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, content, fileIds }: { sessionId: string; content: string; fileIds?: string[] }) =>
      sendBuilderMessageAction(sessionId, content, fileIds ?? []),
    onMutate: async ({ sessionId, content, fileIds }) => {
      await qc.cancelQueries({ queryKey: ["builder", "messages", sessionId] });
      const prev = qc.getQueryData<IBuilderMessagesResult>(["builder", "messages", sessionId, 1]);

      const optimisticMsg: IBuilderMessage = {
        id: "optimistic-" + Date.now(),
        role: "admin",
        content,
        senderId: "",
        summarized: false,
        hasFiles: (fileIds?.length ?? 0) > 0,
        createdAt: new Date(),
      };

      if (prev) {
        qc.setQueryData<IBuilderMessagesResult>(["builder", "messages", sessionId, 1], {
          ...prev,
          messages: [...prev.messages, optimisticMsg],
          total: prev.total + 1,
        });
      }
      return { prev };
    },
    onError: (_err, { sessionId }, context) => {
      if (context?.prev) {
        qc.setQueryData(["builder", "messages", sessionId, 1], context.prev);
      }
    },
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["builder", "messages", sessionId] });
    },
  });
}
