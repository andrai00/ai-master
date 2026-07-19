"use client";

import { UserAddOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
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
  route?: string;
}

const treeSections: ITreeSection[] = [
  {
    labelKey: "fileTree.adminPanel",
    adminOnly: true,
    items: [
      { key: "admin-users", icon: <UserAddOutlined />, labelKey: "fileTree.adminUsers", route: "/admin/users" },
    ],
  },
];

interface IFileTreeProps {
  isAdmin?: boolean;
}

export const FileTree = ({ isAdmin }: IFileTreeProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const visibleSections = treeSections.filter(
    (s) => !s.adminOnly || isAdmin
  );

  const handleClick = (route?: string) => {
    if (route) router.push(route);
  };

  return (
    <div className={styles.tree}>
      {visibleSections.map((section, idx) => (
        <div key={section.labelKey} className={styles.section}>
          {section.adminOnly && idx > 0 && <div className={styles.adminDivider} />}
          <div className={`${styles.sectionHeader} ${section.adminOnly ? styles.adminHeader : ""}`}>
            {t(section.labelKey)}
          </div>
          {section.items.map((item) => (
            <button key={item.key} className={styles.item} onClick={() => handleClick(item.route)}>
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{t(item.labelKey)}</span>
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
