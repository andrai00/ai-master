"use client";

import { Avatar, Tooltip } from "antd";
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { ChatNav } from "@/src/features/sidebar-nav";
import { FileTree } from "@/src/features/file-tree";
import { logoutAction } from "@/src/shared/actions/auth/logout";
import type { ISessionPayload } from "@/src/shared/lib/auth/session";
import styles from "./sidebar.module.css";

interface ISidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: ISessionPayload;
}

const roleLabels: Record<string, string> = {
  admin: "администратор",
  player: "игрок",
};

export const Sidebar = ({ collapsed, onToggle, user }: ISidebarProps) => {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
    router.push("/login");
    router.refresh();
  };

  const name = user?.login || "Гость";
  const role = roleLabels[user?.role || ""] || user?.role || "";
  const isAdmin = user?.role === "admin";

  if (collapsed) {
    return (
      <div className={styles.collapsed}>
        <button className={styles.collapsedBtn} onClick={onToggle}>
          <MenuUnfoldOutlined />
        </button>

        <ChatNav collapsed />

        <div className={styles.collapsedDivider} />

        <Tooltip title="Файлы" placement="right">
          <button className={styles.collapsedIcon}>
            <span className={styles.collapsedIconText}>📁</span>
          </button>
        </Tooltip>

        <div className={styles.collapsedSpacer} />
        <div className={styles.collapsedAvatar}>
          <Avatar size={26} icon={isAdmin ? <CrownOutlined /> : <UserOutlined />} />
        </div>
        <button className={styles.collapsedLogout} onClick={handleLogout} title="Выйти">
          <LogoutOutlined />
        </button>
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
        <Avatar
          size={28}
          icon={isAdmin ? <CrownOutlined /> : <UserOutlined />}
          className={styles.avatar}
        />
        <div className={styles.profileText}>
          <span className={styles.profileName}>{name}</span>
          <span className={styles.profileRole}>{role}</span>
        </div>
        <Tooltip title="Выйти" placement="right">
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogoutOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
