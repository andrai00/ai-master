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
    mutationFn: async (rollId: string) => {
      const result = await executeRollAction(rollId);
      if (!result.success) throw new Error(result.error || "errors.unknownError");
      return result;
    },
    onMutate: async (rollId) => {
      await qc.cancelQueries({ queryKey: ["game", "rolls"] });
      await qc.cancelQueries({ queryKey: ["personal", "rolls"] });

      const prevGame = qc.getQueriesData<TSessionRoll[]>({ queryKey: ["game", "rolls"] });
      const prevPersonal = qc.getQueryData<TSessionRoll[]>(["personal", "rolls"]);

      const update = (rolls: TSessionRoll[] | undefined): TSessionRoll[] | undefined =>
        rolls?.map(r => r.id === rollId ? { ...r, status: "completed", result: "...", detail: "...", completedAt: new Date() } : r);

      for (const [key] of prevGame) {
        qc.setQueryData<TSessionRoll[]>(key, update(qc.getQueryData<TSessionRoll[]>(key)));
      }
      qc.setQueryData<TSessionRoll[]>(["personal", "rolls"], update(prevPersonal));

      return { prevGame, prevPersonal };
    },
    onError: (_err, _rollId, context) => {
      if (!context) return;
      for (const [key, data] of context.prevGame) {
        if (data !== undefined) qc.setQueryData(key, data);
      }
      if (context.prevPersonal !== undefined) {
        qc.setQueryData(["personal", "rolls"], context.prevPersonal);
      }
    },
    onSettled: () => {
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
