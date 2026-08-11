"use client";

import { useTranslation } from "react-i18next";
import { useRouter, usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { FileTextOutlined, IdcardOutlined, BookOutlined, ContainerOutlined } from "@ant-design/icons";
import type { IPlayerDocument } from "@/src/shared/actions/game-master/get-player-documents";
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
  route?: string;
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
  const router = useRouter();
  const pathname = usePathname();

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
        route: `/characters/${doc.id}`,
      })),
    } as ITreeSection));
  }, [documents]);

  const visibleSections = treeSections.filter(
    (s) => !s.adminOnly || isAdmin
  );

  const handleClick = (route?: string) => {
    if (route) router.push(route);
  };

  const isActive = (route?: string) => route ? pathname.startsWith(route) : false;

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
              className={`${styles.item} ${isActive(item.route) ? styles.itemActive : ""}`}
              onClick={() => handleClick(item.route)}
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
