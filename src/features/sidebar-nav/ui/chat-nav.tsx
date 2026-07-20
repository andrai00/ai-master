"use client";

import { Tooltip } from "antd";
import { CommentOutlined, MessageOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
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
  { key: "personal", icon: <MessageOutlined />, labelKey: "sidebar.chatMaster" },
];

interface IChatNavProps {
  collapsed?: boolean;
  isDev?: boolean;
}

export const ChatNav = ({ collapsed, isDev }: IChatNavProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  const items = isDev
    ? allItems.filter((i) => i.key !== "personal")
    : allItems;

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        {items.map((item) => (
          <Tooltip key={item.key} title={t(item.labelKey)} placement="right">
            <button className={styles.collapsedItem} onClick={() => item.route && router.push(item.route)}>
              {item.icon}
            </button>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.nav}>
      {items.map((item) => (
        <button key={item.key} className={styles.item} onClick={() => item.route && router.push(item.route)}>
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemLabel}>{t(item.labelKey)}</span>
        </button>
      ))}
    </div>
  );
};
