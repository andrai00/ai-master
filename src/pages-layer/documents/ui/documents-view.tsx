"use client";

import { Tabs, Table, Modal, Empty, Button, Space, Input } from "antd";
import { FileTextOutlined, BookOutlined, EyeInvisibleOutlined, UserOutlined, ArrowLeftOutlined, SearchOutlined, ExportOutlined, ImportOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useDocuments } from "@/src/shared/api/admin/useDocuments";
import { type IDocumentItem } from "@/src/shared/actions/admin/list-documents";
import { MdViewer } from "@/src/features/md-viewer";
import { ImportMasterModal } from "./import-master-modal";
import { ExportMasterModal } from "./export-master-modal";
import { useState, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColumnsType } from "antd/es/table";
import styles from "./documents-view.module.css";
import { PageHeader } from "@/src/shared/ui/page-header";

const CATEGORIES = [
  { key: "brain", label: "documents.brain", icon: <FileTextOutlined /> },
  { key: "glossary", label: "documents.glossary", icon: <BookOutlined /> },
  { key: "game_hidden", label: "documents.gameHidden", icon: <EyeInvisibleOutlined /> },
  { key: "game_visible", label: "documents.gameVisible", icon: <UserOutlined /> },
];

export const DocumentsView = () => {
  const { t } = useTranslation();
  const [previewDoc, setPreviewDoc] = useState<IDocumentItem | null>(null);
  const [navStack, setNavStack] = useState<IDocumentItem[]>([]);
  const [scrollTo, setScrollTo] = useState<string | undefined>(undefined);
  const [prevOpenDocId, setPrevOpenDocId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: docs = [], isLoading } = useDocuments();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openDocId = searchParams.get("doc");

  // Active tab lives in the URL (?tab=<category>) so a page refresh keeps it.
  const tabParam = searchParams.get("tab");
  const activeTab = CATEGORIES.some((c) => c.key === tabParam) ? (tabParam as string) : CATEGORIES[0]!.key;

  const handleTabChange = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const docMap = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const titleToDoc = useMemo(() => new Map(docs.map((d) => [d.title, d])), [docs]);

  // Open the document referenced by ?doc= in the URL (deep link / share).
  // Runs during render (React's official "adjusting state when props change"
  // pattern) instead of an effect, so state never cascades. If the doc is
  // not loaded yet, keep the previous id so this retries when docs arrive.
  if (openDocId !== prevOpenDocId) {
    const target = openDocId ? docMap.get(openDocId) : null;
    if (target || !openDocId) {
      setPrevOpenDocId(openDocId);
      setPreviewDoc(target ?? null);
      setNavStack([]);
    }
  }

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const q = searchQuery.trim().toLowerCase();

    // Same ranking as the agent's search tool (search_documents / search_rules):
    // 0 = exact title, 1 = title prefix, 2 = title contains, 3 = summary contains,
    // 4 = content contains; within a rank — newest first (updatedAt desc).
    // This lets the admin test the exact search the AI will use.
    const scored: Array<IDocumentItem & { _inContent?: boolean; _score: number }> = [];
    for (const d of docs) {
      const t = d.title.toLowerCase();
      const s = (d.summary ?? "").toLowerCase();
      let score: number;
      if (t === q) score = 0;
      else if (t.startsWith(q)) score = 1;
      else if (t.includes(q)) score = 2;
      else if (s.includes(q)) score = 3;
      else if (d.content.toLowerCase().includes(q)) score = 4;
      else continue;
      scored.push({ ...d, _inContent: score === 4, _score: score });
    }
    scored.sort((a, b) => a._score - b._score || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return scored.slice(0, 100);
  }, [docs, searchQuery]);

  const getCategoryDocs = (cat: string) => filteredDocs.filter((d) => d.category === cat);

  const handleOpenDoc = useCallback((doc: IDocumentItem) => {
    setScrollTo(undefined);
    setPreviewDoc((prev) => {
      if (prev) setNavStack((s) => [...s, prev]);
      return doc;
    });
  }, []);

  const handleNavigate = useCallback((docId: string, anchor?: string) => {
    const stripped = docId.replace(/^(glossary|brain|hidden|visible)\//, "");
    const target =
      docMap.get(docId) ??
      titleToDoc.get(docId) ??
      titleToDoc.get(stripped) ??
      docMap.get(stripped);
    if (!target) return;
    setScrollTo(anchor || "");
    setPreviewDoc((prev) => {
      if (prev && prev.id !== docId) {
        setNavStack((s) => [...s, prev]);
      }
      return { ...target, content: target.content };
    });
  }, [docMap, titleToDoc]);

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

  const columns: ColumnsType<IDocumentItem & { _inContent?: boolean }> = [
    {
      title: t("documents.title"),
      dataIndex: "title",
      ellipsis: true,
      render: (title: string, record) => (
        <span>
          {title || t("documents.untitled")}
          {record._inContent && (
            <span style={{ marginLeft: 8, color: "var(--text-dim)", fontSize: 11 }}>
              {t("documents.inContent")}
            </span>
          )}
        </span>
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={t("documents.title_page")} />
      <div className={styles.page} style={{ padding: 24, maxWidth: 960, margin: "0 auto", width: "100%", overflow: "auto", flex: 1 }}>
      <div className={styles.headerRow}>
      <Input.Search
        allowClear
        className={styles.searchInput}
        placeholder={t("documents.searchPlaceholder")}
        prefix={<SearchOutlined />}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onSearch={(value) => setSearchQuery(value)}
        onBlur={() => setSearchQuery(searchInput)}
      />
      <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>{t("documents.export")}</Button>
      <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>{t("documents.import")}</Button>
      </div>
      <Tabs
        style={{ marginTop: 8 }}
        tabBarGutter={24}
        tabBarStyle={{ marginBottom: 12, paddingLeft: 8 }}
        activeKey={activeTab}
        onChange={handleTabChange}
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
        destroyOnHidden
        footer={null}
        centered
        wrapClassName={styles.modal}
        width={860}
        styles={{ body: { padding: 0, height: "65vh", overflow: "hidden" } }}
      >
        {previewDoc && (
            <MdViewer
              key={previewDoc.id}
              content={previewDoc.content}
              onNavigate={handleNavigate}
              scrollTo={scrollTo}
              showToc
            />
        )}
      </Modal>
      <ImportMasterModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportMasterModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
    </div>
  );
};
