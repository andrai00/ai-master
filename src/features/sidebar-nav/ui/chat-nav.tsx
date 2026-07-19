"use client";

import { Badge, Tooltip } from "antd";
import { CommentOutlined, MessageOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import styles from "./chat-nav.module.css";

export interface IChatNavItem {
  key: string;
  icon: ReactNode;
  labelKey: string;
  unread: number;
}

const demoItems: Omit<IChatNavItem, "labelKey">[] = [
  { key: "common", icon: <CommentOutlined />, unread: 3 },
  { key: "personal", icon: <MessageOutlined />, unread: 1 },
];

interface IChatNavProps {
  collapsed?: boolean;
}

export const ChatNav = ({ collapsed }: IChatNavProps) => {
  const { t } = useTranslation();

  const items: IChatNavItem[] = [
    { ...demoItems[0], labelKey: "sidebar.chatGame" },
    { ...demoItems[1], labelKey: "sidebar.chatMaster" },
  ];

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        {items.map((item) => (
          <Tooltip key={item.key} title={t(item.labelKey)} placement="right">
            <button className={styles.collapsedItem}>
              <Badge count={item.unread} size="small" offset={[4, -2]}>
                {item.icon}
              </Badge>
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
          <Badge count={item.unread} size="small" className={styles.itemBadge} />
        </button>
      ))}
    </div>
  );
};
