"use client";

import { Avatar, Tooltip } from "antd";
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { ChatNav } from "@/src/features/sidebar-nav";
import { FileTree } from "@/src/features/file-tree";
import styles from "./sidebar.module.css";

interface ISidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: ISidebarProps) => {
  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        <button className={styles.collapsedBtn} onClick={onToggle}>
          <MenuUnfoldOutlined />
        </button>

        <ChatNav collapsed />

        <div className={styles.divider} />

        <Tooltip title="Файлы" placement="right">
          <button className={styles.collapsedIcon}>
            <span className={styles.collapsedIconText}>📁</span>
          </button>
        </Tooltip>

        <div className={styles.collapsedSpacer} />
        <div className={styles.collapsedAvatar}>
          <Avatar size={26} icon={<UserOutlined />} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.logo}>ai-master</span>
          <span className={styles.session}>D&D 5e · Забытые Королевства</span>
        </div>
        <Tooltip title="Свернуть панель" placement="right">
          <button className={styles.collapseBtn} onClick={onToggle}>
            <MenuFoldOutlined />
          </button>
        </Tooltip>
      </div>

      <ChatNav />

      <div className={styles.divider} />

      <div className={styles.tree}>
        <FileTree />
      </div>

      <div className={styles.profile}>
        <Avatar size={28} icon={<UserOutlined />} className={styles.avatar} />
        <div className={styles.profileText}>
          <span className={styles.profileName}>Админ</span>
          <span className={styles.profileRole}>administrator</span>
        </div>
      </div>
    </div>
  );
};
