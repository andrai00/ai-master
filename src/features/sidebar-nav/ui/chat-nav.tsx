"use client";

import { Tooltip } from "antd";
import { CommentOutlined, MessageOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import styles from "./chat-nav.module.css";

export interface IChatNavItem {
  key: string;
  icon: ReactNode;
  labelKey: string;
}

const items: IChatNavItem[] = [
  { key: "common", icon: <CommentOutlined />, labelKey: "sidebar.chatGame" },
  { key: "personal", icon: <MessageOutlined />, labelKey: "sidebar.chatMaster" },
];

interface IChatNavProps {
  collapsed?: boolean;
}

export const ChatNav = ({ collapsed }: IChatNavProps) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        {items.map((item) => (
          <Tooltip key={item.key} title={t(item.labelKey)} placement="right">
            <button className={styles.collapsedItem}>
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
        <button key={item.key} className={styles.item}>
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemLabel}>{t(item.labelKey)}</span>
        </button>
      ))}
    </div>
  );
};
