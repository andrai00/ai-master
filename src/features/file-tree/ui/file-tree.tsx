"use client";

import { UserAddOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
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
}

const treeSections: ITreeSection[] = [
  {
    labelKey: "fileTree.adminPanel",
    adminOnly: true,
    items: [
      { key: "admin-users", icon: <UserAddOutlined />, labelKey: "fileTree.adminUsers" },
    ],
  },
];

interface IFileTreeProps {
  isAdmin?: boolean;
}

export const FileTree = ({ isAdmin }: IFileTreeProps) => {
  const { t } = useTranslation();
  const visibleSections = treeSections.filter(
    (s) => !s.adminOnly || isAdmin
  );

  return (
    <div className={styles.tree}>
      {visibleSections.map((section) => (
        <div key={section.labelKey} className={styles.section}>
          {section.adminOnly && <div className={styles.adminDivider} />}
          <div className={`${styles.sectionHeader} ${section.adminOnly ? styles.adminHeader : ""}`}>
            {t(section.labelKey)}
          </div>
          {section.items.map((item) => (
            <button key={item.key} className={styles.item}>
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
