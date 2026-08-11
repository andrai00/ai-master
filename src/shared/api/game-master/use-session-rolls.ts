"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { executeRollAction, removeRollAction } from "@/src/shared/actions/game-master/roll-actions";
import { getSessionRollsAction, type TSessionRoll } from "@/src/shared/actions/game-master/get-session-rolls";
import { getPersonalRollsAction } from "@/src/shared/actions/game-master/get-personal-rolls";

export { TSessionRoll };

export function useSessionRolls(sessionId?: string) {
  return useQuery({
    queryKey: ["game", "rolls", sessionId],
    queryFn: () => getSessionRollsAction(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function usePersonalRolls() {
  return useQuery({
    queryKey: ["personal", "rolls"],
    queryFn: getPersonalRollsAction,
    staleTime: 0,
  });
}

export function useExecuteRoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rollId: string) => executeRollAction(rollId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", "rolls"] });
      qc.invalidateQueries({ queryKey: ["personal", "rolls"] });
    },
  });
}

export function useRemoveRoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rollId: string) => removeRollAction(rollId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", "rolls"] });
      qc.invalidateQueries({ queryKey: ["personal", "rolls"] });
    },
  });
}
