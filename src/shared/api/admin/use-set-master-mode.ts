"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setMasterModeAction } from "@/src/shared/actions/admin/set-master-mode";

export function useSetMasterMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setMasterModeAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "activeMode"] });
      qc.invalidateQueries({ queryKey: ["admin", "currentGame"] });
    },
  });
}
