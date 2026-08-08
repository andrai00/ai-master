"use client";

import { Modal, Button, Space } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useState, useCallback, useEffect, useRef } from "react";
import { MdViewer } from "@/src/features/md-viewer";
import { getDocumentAction, type IDocumentData } from "@/src/shared/actions/documents/get-document";
import { resolveDocumentByPath } from "@/src/shared/actions/documents/resolve-document-path";
import GithubSlug from "github-slugger";

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
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && docId) {
      setNavStack([]);
      setScrollTo(undefined);
      setDoc(null);
      loadDoc(docId);
    }
  }, [open, docId]);

  useEffect(() => {
    if (doc) {
      setScrollTo(undefined);
      requestAnimationFrame(() => {
        const el = contentRef.current?.querySelector('[class*="content"]') as HTMLElement | null;
        if (el) el.scrollTop = 0;
      });
      if (anchor) {
        setTimeout(() => { setScrollTo(anchor); }, 300);
      }
    }
  }, [doc, anchor]);

  const loadDoc = async (id: string) => {
    setLoading(true);
    let d = await getDocumentAction(id);
    if (!d) {
      const resolved = await resolveDocumentByPath(id);
      if (resolved) d = await getDocumentAction(resolved.docId);
    }
    setDoc(d);
    setLoading(false);
  };

  const handleNavigate = useCallback((targetId: string, anchor?: string) => {
    setScrollTo(anchor || "");
    if (targetId !== doc?.id) {
      setNavStack((s) => [...s, doc!]);
      loadDoc(targetId);
    }
  }, [doc]);

  const handleBack = useCallback(() => {
    setScrollTo(undefined);
    setNavStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setDoc(prev);
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
