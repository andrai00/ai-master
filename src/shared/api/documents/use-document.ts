"use client";

import { useQuery } from "@tanstack/react-query";
import { getDocumentAction, type IDocumentData } from "@/src/shared/actions/documents/get-document";
import { resolveDocumentByPath } from "@/src/shared/actions/documents/resolve-document-path";

async function fetchDocument(id: string): Promise<IDocumentData | null> {
  let d = await getDocumentAction(id);
  if (!d) {
    const resolved = await resolveDocumentByPath(id);
    if (resolved) d = await getDocumentAction(resolved.docId);
  }
  return d;
}

export function useDocument(docId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["documents", "byId", docId],
    queryFn: () => fetchDocument(docId!),
    enabled: enabled && !!docId,
    staleTime: 60_000,
  });
}
