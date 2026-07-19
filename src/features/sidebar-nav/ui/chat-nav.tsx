"use client";

import { Badge, Tooltip } from "antd";
import { CommentOutlined, UserOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import styles from "./chat-nav.module.css";

export interface IChatNavItem {
  key: string;
  icon: ReactNode;
  label: string;
  unread: number;
}

const demoItems: IChatNavItem[] = [
  { key: "common", icon: <CommentOutlined />, label: "Чат игры", unread: 3 },
  { key: "personal", icon: <UserOutlined />, label: "Вопрос мастеру", unread: 1 },
];

interface IChatNavProps {
  collapsed?: boolean;
}

export const ChatNav = ({ collapsed }: IChatNavProps) => {
  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        {demoItems.map((item) => (
          <Tooltip key={item.key} title={item.label} placement="right">
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
      {demoItems.map((item) => (
        <button key={item.key} className={styles.item}>
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemLabel}>{item.label}</span>
          <Badge count={item.unread} size="small" className={styles.itemBadge} />
        </button>
      ))}
    </div>
  );
};
