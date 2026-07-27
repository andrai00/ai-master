"use client";

import { Tooltip } from "antd";
import { CommentOutlined, MessageOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./chat-nav.module.css";

export interface IChatNavItem {
  key: string;
  icon: ReactNode;
  labelKey: string;
  route?: string;
}

const allItems: IChatNavItem[] = [
  { key: "common", icon: <CommentOutlined />, labelKey: "sidebar.chatGame", route: "/" },
  { key: "personal", icon: <MessageOutlined />, labelKey: "sidebar.chatMaster", route: "/chat/personal" },
];

interface IChatNavProps {
  collapsed?: boolean;
  isDev?: boolean;
}

export const ChatNav = ({ collapsed, isDev }: IChatNavProps) => {
  const { t } = useTranslation();
  const pathname = usePathname();

  const items = isDev
    ? allItems.filter((i) => i.key !== "personal")
    : allItems;

  const isActive = (item: IChatNavItem) => (item.route ? pathname.startsWith(item.route) : pathname === "/");

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        {items.map((item) => (
          <Tooltip key={item.key} title={t(item.labelKey)} placement="right">
            <Link
              href={item.route ?? "/"}
              className={`${styles.collapsedItem} ${isActive(item) ? styles.active : ""}`}
            >
              {item.icon}
            </Link>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.nav}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.route ?? "/"}
          className={`${styles.item} ${isActive(item) ? styles.active : ""}`}
        >
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemLabel}>{t(item.labelKey)}</span>
        </Link>
      ))}
    </div>
  );
};
