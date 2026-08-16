"use client";

import { Modal, Button, Space } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useState, useCallback, useEffect } from "react";
import { MdViewer } from "@/src/features/md-viewer";
import { getDocumentAction, type IDocumentData } from "@/src/shared/actions/documents/get-document";
import { resolveDocumentByPath } from "@/src/shared/actions/documents/resolve-document-path";

interface IDocumentPreviewModalProps {
  open: boolean;
  docId: string | null;
  anchor?: string;
  onClose: () => void;
}

export function DocumentPreviewModal({ open, docId, anchor, onClose }: IDocumentPreviewModalProps) {
  const [doc, setDoc] = useState<IDocumentData | null>(null);
  const [navStack, setNavStack] = useState<IDocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | undefined>(undefined);
  const [loadedKey, setLoadedKey] = useState<{ open: boolean; docId: string | null }>({ open: false, docId: null });

  const fetchDoc = useCallback(async (id: string): Promise<IDocumentData | null> => {
    let d = await getDocumentAction(id);
    if (!d) {
      const resolved = await resolveDocumentByPath(id);
      if (resolved) d = await getDocumentAction(resolved.docId);
    }
    return d;
  }, []);

  // Reset navigation state when the modal opens or switches documents.
  // Runs during render (React's official "adjusting state when props change"
  // pattern) instead of an effect, so state never cascades.
  if (open !== loadedKey.open || docId !== loadedKey.docId) {
    setLoadedKey({ open, docId });
    if (open && docId) {
      setNavStack([]);
      setScrollTo(undefined);
      setDoc(null);
    }
  }

  // Load the document on open / docId change. setState happens only inside
  // the async callback, never synchronously in the effect body.
  useEffect(() => {
    if (!open || !docId) return;
    let cancelled = false;
    void fetchDoc(docId).then((d) => {
      if (cancelled) return;
      setDoc(d);
      setLoading(false);
      if (anchor) setScrollTo(anchor);
    });
    return () => { cancelled = true; };
  }, [open, docId, anchor, fetchDoc]);

  const handleNavigate = useCallback((targetId: string, anchor?: string) => {
    if (targetId === doc?.id) {
      setScrollTo(anchor || "");
      return;
    }
    setNavStack((s) => (doc ? [...s, doc] : s));
    setLoading(true);
    void fetchDoc(targetId).then((d) => {
      setDoc(d);
      setLoading(false);
      setScrollTo(anchor || "");
    });
  }, [doc, fetchDoc]);

  const handleBack = useCallback(() => {
    setScrollTo(undefined);
    setNavStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setDoc(prev);
      setLoading(false);
      return s.slice(0, -1);
    });
  }, []);

  return (
    <Modal
      title={
        <Space>
          {navStack.length > 0 && (
            <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={handleBack} />
          )}
          {doc?.title || "..."}
        </Space>
      }
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={null}
      width={860}
      centered
      styles={{ body: { padding: 0, height: "70vh", overflow: "hidden" } }}
    >
      {loading || !doc ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Loading...</div>
      ) : (
        <MdViewer key={doc.id} content={doc.content} onNavigate={handleNavigate} scrollTo={scrollTo} showToc />
      )}
    </Modal>
  );
}
