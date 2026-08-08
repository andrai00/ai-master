"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendGameMessageAction } from "@/src/shared/actions/game-master/send-game-message";
import type { IGameMessagesResult, IGameMessage } from "@/src/shared/actions/game-master/get-game-messages";

export function useSendGameMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      sendGameMessageAction(sessionId, content),
    onMutate: async ({ sessionId, content }) => {
      await qc.cancelQueries({ queryKey: ["game", "messages", sessionId] });
      const prev = qc.getQueryData<IGameMessagesResult>(["game", "messages", sessionId, 1]);

      const optimisticMsg: IGameMessage = {
        id: "optimistic-" + Date.now(),
        role: "player",
        content,
        senderId: "",
        shared: false,
        summarized: false,
        createdAt: new Date(),
      };

      if (prev) {
        qc.setQueryData<IGameMessagesResult>(["game", "messages", sessionId, 1], {
          ...prev,
          messages: [...prev.messages, optimisticMsg],
          total: prev.total + 1,
        });
      }
      return { prev };
    },
    onError: (_err, { sessionId }, context) => {
      if (context?.prev) {
        qc.setQueryData(["game", "messages", sessionId, 1], context.prev);
      }
    },
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
    },
  });
}
