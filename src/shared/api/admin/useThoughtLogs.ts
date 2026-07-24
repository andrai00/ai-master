"use client";

import { useQuery } from "@tanstack/react-query";
import { listThoughtLogsAction } from "@/src/shared/actions/admin/list-thought-logs";

export function useThoughtLogs() {
  return useQuery({
    queryKey: ["admin", "thoughtLogs"],
    queryFn: listThoughtLogsAction,
    refetchInterval: 5000,
  });
}
