"use client";

import { Tabs, Table, Modal, Empty } from "antd";
import { FileTextOutlined, BookOutlined, EyeOutlined, EyeInvisibleOutlined, UserOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listDocumentsAction, type IDocumentItem } from "@/src/shared/actions/admin/list-documents";
import { useState } from "react";
import type { ColumnsType } from "antd/es/table";

const CATEGORIES = [
  { key: "glossary", label: "documents.glossary", icon: <BookOutlined /> },
  { key: "brain", label: "documents.brain", icon: <FileTextOutlined /> },
  { key: "game_hidden", label: "documents.gameHidden", icon: <EyeInvisibleOutlined /> },
  { key: "game_visible", label: "documents.gameVisible", icon: <UserOutlined /> },
];

export const DocumentsView = () => {
  const { t } = useTranslation();
  const [previewDoc, setPreviewDoc] = useState<IDocumentItem | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: listDocumentsAction,
  });

  const getCategoryDocs = (cat: string) => docs.filter((d) => d.category === cat);

  const columns: ColumnsType<IDocumentItem> = [
    {
      title: t("documents.title"),
      dataIndex: "title",
      ellipsis: true,
      render: (title: string, record) => (
        <a onClick={() => setPreviewDoc(record)} style={{ cursor: "pointer" }}>
          {title || t("documents.untitled")}
        </a>
      ),
    },
    {
      title: t("documents.type"),
      dataIndex: "type",
      width: 120,
    },
    {
      title: t("documents.summary"),
      dataIndex: "summary",
      ellipsis: true,
      width: 200,
      render: (s: string | null) => s || "-",
    },
    {
      title: t("documents.updated"),
      dataIndex: "updatedAt",
      width: 160,
      render: (d: Date) => new Date(d).toLocaleString("ru"),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto", height: "100%", overflow: "auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
        {t("documents.title_page")}
      </h2>
      <Tabs
        items={CATEGORIES.map((cat) => ({
          key: cat.key,
          label: (
            <span>
              {cat.icon} {t(cat.label)}
              <span style={{ marginLeft: 4, color: "var(--text-muted)", fontSize: 11 }}>
                ({getCategoryDocs(cat.key).length})
              </span>
            </span>
          ),
          children: (
            <Table
              dataSource={getCategoryDocs(cat.key)}
              columns={columns}
              rowKey="id"
              size="small"
              loading={isLoading}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              locale={{ emptyText: <Empty description={t("documents.empty")} /> }}
            />
          ),
        }))}
      />
      <Modal
        title={previewDoc?.title || t("documents.preview")}
        open={!!previewDoc}
        onCancel={() => setPreviewDoc(null)}
        footer={null}
        centered
        width={640}
      >
        {previewDoc && (
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              maxHeight: "60vh",
              overflow: "auto",
            }}
          >
            {previewDoc.content}
          </div>
        )}
      </Modal>
    </div>
  );
};
