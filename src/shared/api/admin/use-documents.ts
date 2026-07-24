"use client";

import { useQuery } from "@tanstack/react-query";
import { listDocumentsAction } from "@/src/shared/actions/admin/list-documents";

export function useDocuments() {
  return useQuery({
    queryKey: ["admin", "documents"],
    queryFn: listDocumentsAction,
  });
}
