"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersAction } from "@/src/shared/actions/admin/list-users";

export function useListUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: listUsersAction,
    staleTime: 0,
  });
}
