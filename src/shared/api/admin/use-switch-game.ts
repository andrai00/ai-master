"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switchGameAction } from "@/src/shared/actions/admin/switch-game";

export function useSwitchGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: switchGameAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
