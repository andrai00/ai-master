"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { subscribeDocumentDeleted } from "@/src/shared/lib/realtime/client";
import { DocumentPreviewModal } from "./document-preview-modal";

interface IDocumentPreviewContext {
  openDocument: (docId: string, anchor?: string) => void;
  closeDocument: () => void;
}

const DocumentPreviewContext = createContext<IDocumentPreviewContext | null>(null);

/**
 * Single, app-wide document preview modal. Both chat wiki-links and the
 * sidebar file tree open the same modal — one unified way to view docs.
 */
export function DocumentPreviewProvider({ children }: { children: ReactNode }) {
  const [docId, setDocId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | undefined>(undefined);

  const openDocument = useCallback((id: string, a?: string) => {
    setDocId(id);
    setAnchor(a);
  }, []);

  const closeDocument = useCallback(() => {
    setDocId(null);
    setAnchor(undefined);
  }, []);

  // Close the modal only when the document it shows is deleted.
  useEffect(() => {
    const unsub = subscribeDocumentDeleted((deletedId) => {
      setDocId((cur) => (cur === deletedId ? null : cur));
    });
    return unsub;
  }, []);

  const value = useMemo(
    () => ({ openDocument, closeDocument }),
    [openDocument, closeDocument]
  );

  return (
    <DocumentPreviewContext.Provider value={value}>
      {children}
      <DocumentPreviewModal
        open={docId !== null}
        docId={docId}
        anchor={anchor}
        onClose={closeDocument}
      />
    </DocumentPreviewContext.Provider>
  );
}

export function useDocumentPreview(): IDocumentPreviewContext {
  const ctx = useContext(DocumentPreviewContext);
  if (!ctx) throw new Error("useDocumentPreview must be used within DocumentPreviewProvider");
  return ctx;
}
