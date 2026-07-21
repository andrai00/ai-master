"use client";

import { useQuery } from "@tanstack/react-query";
import { getBuilderSessionAction } from "@/src/shared/actions/builder/get-session";

export function useBuilderSession() {
  return useQuery({
    queryKey: ["builder", "session"],
    queryFn: getBuilderSessionAction,
    staleTime: Infinity,
  });
}
