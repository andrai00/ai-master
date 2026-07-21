"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteBuilderMessageAction } from "@/src/shared/actions/builder/delete-message";

export function useDeleteBuilderMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteBuilderMessageAction(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builder", "messages"] });
    },
  });
}
