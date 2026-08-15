"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePersonalMessageAction } from "@/src/shared/actions/game-master/delete-personal-message";

export function useDeletePersonalMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deletePersonalMessageAction(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal", "messages"] });
    },
  });
}
