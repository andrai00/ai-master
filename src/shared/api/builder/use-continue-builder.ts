"use client";

import { useMutation } from "@tanstack/react-query";
import { continueBuilderAction } from "@/src/shared/actions/builder/continue-builder";

export function useContinueBuilder() {
  return useMutation({
    mutationFn: (sessionId: string) => continueBuilderAction(sessionId),
  });
}
