"use client";

import { Modal, Button, Space } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useState, useCallback, useEffect } from "react";
import { MdViewer } from "@/src/features/md-viewer";
import { getDocumentAction, type IDocumentData } from "@/src/shared/actions/documents/get-document";
import GithubSlug from "github-slugger";

interface IDocumentPreviewModalProps {
  open: boolean;
  docId: string | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ open, docId, onClose }: IDocumentPreviewModalProps) {
  const [doc, setDoc] = useState<IDocumentData | null>(null);
  const [navStack, setNavStack] = useState<IDocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open && docId) {
      setNavStack([]);
      loadDoc(docId);
    }
  }, [open, docId]);

  const loadDoc = async (id: string) => {
    setLoading(true);
    const d = await getDocumentAction(id);
    if (d) setDoc(d);
    setLoading(false);
  };

  const handleNavigate = useCallback((targetId: string, anchor?: string) => {
    const anchorSlug = anchor ? new GithubSlug().slug(anchor) : undefined;
    setScrollTo(anchorSlug || undefined);
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
      footer={null}
      width={860}
      centered
      styles={{ body: { padding: 0, height: "70vh", overflow: "hidden" } }}
    >
      {loading || !doc ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Loading...</div>
      ) : (
        <MdViewer content={doc.content} onNavigate={handleNavigate} scrollTo={scrollTo} showToc />
      )}
    </Modal>
  );
}
