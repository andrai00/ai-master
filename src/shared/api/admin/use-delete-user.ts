"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUserAction } from "@/src/shared/actions/admin/delete-user";

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteUserAction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
