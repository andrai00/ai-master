"use client";

import { Modal, Button, Space } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useState, useCallback, useEffect, useRef } from "react";
import { MdViewer } from "@/src/features/md-viewer";
import { useDocument } from "@/src/shared/api/documents/use-document";
import { supportsFormulaCategory } from "@/src/shared/lib/formula";

interface IDocumentPreviewModalProps {
  open: boolean;
  docId: string | null;
  anchor?: string;
  onClose: () => void;
}

export function DocumentPreviewModal({ open, docId, anchor, onClose }: IDocumentPreviewModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [navStack, setNavStack] = useState<string[]>([]);
  const [scrollTo, setScrollTo] = useState<string | undefined>(undefined);
  const [restoreTop, setRestoreTop] = useState(0);
  const [loadedKey, setLoadedKey] = useState<{ open: boolean; docId: string | null }>({ open: false, docId: null });
  const scrollTopRef = useRef(0);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  const activeId = targetId ?? docId;
  const { data: doc, isLoading } = useDocument(activeId, open);

  // Reset local navigation when the modal opens or the requested doc changes.
  // Runs during render (React's official "adjusting state when props change"
  // pattern) instead of an effect, so state never cascades.
  if (open !== loadedKey.open || docId !== loadedKey.docId) {
    setLoadedKey({ open, docId });
    if (open && docId) {
      setNavStack([]);
      setScrollTo(anchor || undefined);
      setTargetId(null);
      setRestoreTop(0);
    }
  }

  // Reset the scroll-position cache when a new document is opened (refs cannot
  // be mutated during render — the "adjusting state" block above handles state).
  useEffect(() => {
    if (!open || !docId) return;
    scrollTopRef.current = 0;
    scrollPositionsRef.current = {};
  }, [open, docId]);

  const handleNavigate = useCallback((nextId: string, nextAnchor?: string) => {
    setScrollTo(nextAnchor || "");
    if (nextId !== activeId) {
      if (activeId) scrollPositionsRef.current[activeId] = scrollTopRef.current;
      setNavStack((s) => (activeId ? [...s, activeId] : s));
      setTargetId(nextId);
    }
  }, [activeId]);

  const handleBack = useCallback(() => {
    setScrollTo(undefined);
    if (activeId) scrollPositionsRef.current[activeId] = scrollTopRef.current;
    setNavStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setTargetId(prev);
      setRestoreTop(scrollPositionsRef.current[prev] ?? 0);
      return s.slice(0, -1);
    });
  }, [activeId]);

  const handleScroll = useCallback((top: number) => {
    scrollTopRef.current = top;
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
      {isLoading ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Loading...</div>
      ) : !doc ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Document not found</div>
      ) : (
        <MdViewer
          key={doc.id}
          content={doc.content}
          onNavigate={handleNavigate}
          scrollTo={scrollTo}
          initialScrollTop={restoreTop}
          onScroll={handleScroll}
          showToc
          formulas={supportsFormulaCategory(doc.category)}
        />
      )}
    </Modal>
  );
}
