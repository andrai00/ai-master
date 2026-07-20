"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editUserAction } from "@/src/shared/actions/admin/edit-user";
import { setUserGameAccessAction } from "@/src/shared/actions/admin/game-access";

export function useEditUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; displayName: string; password?: string; role?: string; gameAccess: string[] }) => {
      const result = await editUserAction(params.userId, {
        displayName: params.displayName,
        password: params.password || undefined,
        role: params.role,
      });
      if (result.success) {
        await setUserGameAccessAction(params.userId, params.gameAccess);
      }
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
