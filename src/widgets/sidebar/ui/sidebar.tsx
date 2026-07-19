"use client";

import { Avatar, Tooltip } from "antd";
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FolderOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
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
        <button className={styles.collapsedBtn} onClick={onToggle} title="Развернуть панель">
          <MenuUnfoldOutlined />
        </button>
        <Tooltip title="Файлы" placement="right">
          <button className={styles.collapsedIcon}>
            <FolderOutlined />
          </button>
        </Tooltip>
        <Tooltip title="Сессии" placement="right">
          <button className={styles.collapsedIcon}>
            <CalendarOutlined />
          </button>
        </Tooltip>
        <div className={styles.collapsedSpacer} />
        <Tooltip title="Профиль" placement="right">
          <button className={styles.collapsedIcon}>
            <UserOutlined />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.logo}>ai-master</span>
        <span className={styles.session}>D&D 5e · Забытые Королевства</span>
      </div>

      <div className={styles.tree}>
        <FileTree />
      </div>

      <div className={styles.profile}>
        <div className={styles.profileInfo}>
          <Avatar size={28} icon={<UserOutlined />} className={styles.avatar} />
          <div className={styles.profileText}>
            <span className={styles.profileName}>Админ</span>
            <span className={styles.profileRole}>administrator</span>
          </div>
        </div>
        <Tooltip title="Свернуть панель" placement="right">
          <button className={styles.collapseBtn} onClick={onToggle}>
            <MenuFoldOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
