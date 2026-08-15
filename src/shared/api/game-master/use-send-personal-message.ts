"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendPersonalMessageAction } from "@/src/shared/actions/game-master/send-personal-message";
import type { IPersonalMessagesResult, IPersonalMessage } from "@/src/shared/actions/game-master/get-personal-messages";

export function useSendPersonalMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      sendPersonalMessageAction(sessionId, content),
    onMutate: async ({ sessionId, content }) => {
      await qc.cancelQueries({ queryKey: ["personal", "messages", sessionId] });
      const prev = qc.getQueryData<IPersonalMessagesResult>(["personal", "messages", sessionId, 1]);

      const optimisticMsg: IPersonalMessage = {
        id: "optimistic-" + Date.now(),
        role: "player",
        content,
        senderId: "",
        senderDisplayName: "",
        senderAvatar: "",
        summarized: false,
        createdAt: new Date(),
      };

      if (prev) {
        qc.setQueryData<IPersonalMessagesResult>(["personal", "messages", sessionId, 1], {
          ...prev,
          messages: [...prev.messages, optimisticMsg],
          total: prev.total + 1,
        });
      }
      return { prev };
    },
    onError: (_err, { sessionId }, context) => {
      if (context?.prev) {
        qc.setQueryData(["personal", "messages", sessionId, 1], context.prev);
      }
    },
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
    },
  });
}
