"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeDocumentDeleted } from "@/src/shared/lib/realtime/client";

interface IDocLiveGuardProps {
  docId: string;
}

/**
 * Redirects away when the currently viewed document is deleted via SSE.
 * Updates and deletions of other documents do not affect it.
 */
export function DocLiveGuard({ docId }: IDocLiveGuardProps) {
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeDocumentDeleted((deletedId) => {
      if (deletedId === docId) {
        router.replace("/");
      }
    });
    return unsub;
  }, [docId, router]);

  return null;
}
