"use client";

import { useTranslation } from "react-i18next";
import { useMemo, type ReactNode } from "react";
import { FileTextOutlined, IdcardOutlined, BookOutlined, ContainerOutlined } from "@ant-design/icons";
import type { IPlayerDocument } from "@/src/shared/actions/game-master/get-player-documents";
import { useDocumentPreview } from "@/src/shared/ui/document-preview-provider";
import styles from "./file-tree.module.css";

interface ITreeSection {
  labelKey: string;
  items: ITreeItem[];
  adminOnly?: boolean;
}

interface ITreeItem {
  key: string;
  icon: ReactNode;
  labelKey: string;
  label?: string;
}

const SECTION_ICONS: Record<string, ReactNode> = {
  character_sheet: <IdcardOutlined />,
  inventory: <ContainerOutlined />,
  lore: <BookOutlined />,
  note: <FileTextOutlined />,
};

function getDocIcon(type: string): ReactNode {
  return SECTION_ICONS[type] ?? <FileTextOutlined />;
}

interface IFileTreeProps {
  isAdmin?: boolean;
  documents?: IPlayerDocument[];
}

export const FileTree = ({ isAdmin, documents }: IFileTreeProps) => {
  const { t } = useTranslation();
  const { openDocument } = useDocumentPreview();

  const treeSections = useMemo(() => {
    if (!documents || documents.length === 0) return [] as ITreeSection[];

    const bySection = new Map<string, IPlayerDocument[]>();

    for (const doc of documents) {
      const section = doc.section || "__default__";
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push(doc);
    }

    return Array.from(bySection.entries()).map(([section, docs]) => ({
      labelKey: section === "__default__" ? "fileTree.defaultSection" : section,
      items: docs.map((doc) => ({
        key: doc.id,
        icon: getDocIcon(doc.type),
        labelKey: doc.title,
        label: doc.title,
      })),
    } as ITreeSection));
  }, [documents]);

  const visibleSections = treeSections.filter(
    (s) => !s.adminOnly || isAdmin
  );

  return (
    <div className={styles.tree}>
      {visibleSections.map((section) => (
        <div key={section.labelKey} className={styles.section}>
          <div className={styles.sectionHeader}>
            {section.labelKey.startsWith("fileTree.") ? t(section.labelKey) : section.labelKey}
          </div>
          {section.items.map((item) => (
            <button
              key={item.key}
              className={styles.item}
              onClick={() => openDocument(item.key)}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{item.label || t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      ))}
      {visibleSections.length === 0 && (
        <div className={styles.empty}>{t("fileTree.empty")}</div>
      )}
    </div>
  );
};
