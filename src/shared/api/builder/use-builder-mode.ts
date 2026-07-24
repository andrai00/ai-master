"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setBuilderModeAction, getBuilderModeAction, TBuilderMode } from "@/src/shared/actions/builder/set-builder-mode";

export function useBuilderMode(sessionId: string | null) {
  const queryClient = useQueryClient();

  const { data: mode, refetch } = useQuery({
    queryKey: ["builderMode", sessionId],
    queryFn: () => getBuilderModeAction(sessionId!),
    enabled: !!sessionId,
    staleTime: 30000,
  });

  const setMode = useMutation({
    mutationFn: (mode: TBuilderMode) => setBuilderModeAction(sessionId!, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builderMode", sessionId] });
    },
  });

  return { mode: mode ?? "brain", setMode: setMode.mutateAsync, refetch };
}
