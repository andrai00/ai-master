"use client";

import { Tabs, Table, Modal, Empty, Button, Space } from "antd";
import { FileTextOutlined, BookOutlined, EyeInvisibleOutlined, UserOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useDocuments } from "@/src/shared/api/admin/useDocuments";
import { type IDocumentItem } from "@/src/shared/actions/admin/list-documents";
import { MdViewer } from "@/src/features/md-viewer";
import GithubSlug from "github-slugger";
import { useState, useCallback, useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import styles from "./documents-view.module.css";

const CATEGORIES = [
  { key: "glossary", label: "documents.glossary", icon: <BookOutlined /> },
  { key: "brain", label: "documents.brain", icon: <FileTextOutlined /> },
  { key: "game_hidden", label: "documents.gameHidden", icon: <EyeInvisibleOutlined /> },
  { key: "game_visible", label: "documents.gameVisible", icon: <UserOutlined /> },
];

export const DocumentsView = () => {
  const { t } = useTranslation();
  const [previewDoc, setPreviewDoc] = useState<IDocumentItem | null>(null);
  const [navStack, setNavStack] = useState<IDocumentItem[]>([]);
  const [scrollTo, setScrollTo] = useState<string | undefined>(undefined);
  const [pageSize, setPageSize] = useState(20);

  const { data: docs = [], isLoading } = useDocuments();

  const docMap = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  const getCategoryDocs = (cat: string) => docs.filter((d) => d.category === cat);

  const handleOpenDoc = useCallback((doc: IDocumentItem) => {
    setScrollTo(undefined);
    setPreviewDoc((prev) => {
      if (prev) setNavStack((s) => [...s, prev]);
      return doc;
    });
  }, []);

  const handleNavigate = useCallback((docId: string, anchor?: string) => {
    const target = docMap.get(docId);
    if (!target) return;
    const anchorSlug = anchor ? new GithubSlug().slug(anchor) : undefined;
    setScrollTo(anchorSlug || undefined);
    setPreviewDoc((prev) => {
      if (prev && prev.id !== docId) {
        setNavStack((s) => [...s, prev]);
      }
      return { ...target, content: target.content }; // fresh ref for scrollTo effect
    });
  }, [docMap]);

  const handleBack = useCallback(() => {
    setScrollTo(undefined);
    setNavStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setPreviewDoc(prev);
      return s.slice(0, -1);
    });
  }, []);

  const handleClose = useCallback(() => {
    setPreviewDoc(null);
    setNavStack([]);
  }, []);

  const columns: ColumnsType<IDocumentItem> = [
    {
      title: t("documents.title"),
      dataIndex: "title",
      ellipsis: true,
      render: (title: string) => (
        <span>{title || t("documents.untitled")}</span>
      ),
    },
    {
      title: t("documents.type"),
      dataIndex: "type",
      width: 120,
      responsive: ["md"],
    },
    {
      title: t("documents.summary"),
      dataIndex: "summary",
      ellipsis: true,
      width: 200,
      responsive: ["md"],
      render: (s: string | null) => s || t("common.noData"),
    },
    {
      title: t("documents.updated"),
      dataIndex: "updatedAt",
      width: 160,
      render: (d: Date) => new Date(d).toLocaleString("ru"),
    },
  ];

  return (
    <div className={styles.page} style={{ padding: 24, maxWidth: 960, margin: "0 auto", height: "100%", overflow: "auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 0, color: "var(--text-primary)" }}>
        {t("documents.title_page")}
      </h2>
      <Tabs
        style={{ marginTop: 8 }}
        tabBarGutter={24}
        tabBarStyle={{ marginBottom: 12, paddingLeft: 8 }}
        items={CATEGORIES.map((cat) => ({
          key: cat.key,
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {cat.icon} {t(cat.label)}
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                ({getCategoryDocs(cat.key).length})
              </span>
            </span>
          ),
          children: (
            <div style={{ paddingTop: 4 }}>
            <Table
              dataSource={getCategoryDocs(cat.key)}
              columns={columns}
              rowKey="id"
              size="small"
              loading={isLoading}
              onRow={(record) => ({
                onClick: () => handleOpenDoc(record),
                style: { cursor: "pointer" },
              })}
              pagination={{ pageSize, showSizeChanger: { showSearch: false }, hideOnSinglePage: true, onChange: (_page, size) => setPageSize(size) }}
              locale={{ emptyText: <Empty description={t("documents.empty")} /> }}
            />
            </div>
          ),
        }))}
      />
      <Modal
        title={
          <Space>
            {navStack.length > 0 && (
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                style={{ marginRight: 4 }}
              />
            )}
            <span>{previewDoc?.title || t("documents.preview")}</span>
          </Space>
        }
        open={!!previewDoc}
        onCancel={handleClose}
        footer={null}
        centered
        wrapClassName={styles.modal}
        width={860}
        styles={{ body: { padding: 0, height: "65vh", overflow: "hidden" } }}
      >
        {previewDoc && (
          <MdViewer
            content={previewDoc.content}
            onNavigate={handleNavigate}
            scrollTo={scrollTo}
            showToc
          />
        )}
      </Modal>
    </div>
  );
};
