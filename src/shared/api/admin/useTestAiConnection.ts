"use client";

import { useMutation } from "@tanstack/react-query";
import { testAiConnectionFromDbAction } from "@/src/shared/actions/admin/test-ai-connection";

export function useTestAiConnection() {
  return useMutation({
    mutationFn: testAiConnectionFromDbAction,
  });
}
