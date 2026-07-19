"use client";

import { Avatar, Tooltip, Modal, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  SettingOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatNav } from "@/src/features/sidebar-nav";
import { FileTree } from "@/src/features/file-tree";
import { ProfileSettingsModal } from "@/src/features/profile-settings";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || user?.login || "Гость");

  const handleLogout = () => {
    Modal.confirm({
      title: "Выйти из аккаунта?",
      content: "Вы будете перенаправлены на страницу входа.",
      okText: "Выйти",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        await logoutAction();
        router.push("/login");
        router.refresh();
      },
    });
  };

  const profileMenuItems: MenuProps["items"] = [
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "Настройки профиля",
      onClick: () => setSettingsOpen(true),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Выйти",
      danger: true,
      onClick: handleLogout,
    },
  ];

  const isAdmin = user?.role === "admin";
  const avatarUrl = ""; // TODO: load from DB
  const name = displayName;
  const role = roleLabels[user?.role || ""] || user?.role || "";

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
        <Dropdown menu={{ items: profileMenuItems }} placement="topRight" trigger={["click"]}>
          <div className={styles.collapsedAvatar}>
            <Avatar size={26} icon={isAdmin ? <CrownOutlined /> : <UserOutlined />} />
          </div>
        </Dropdown>
        <ProfileSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          currentName={displayName}
          currentAvatar={avatarUrl}
          onNameChange={setDisplayName}
        />
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
        <FileTree isAdmin={isAdmin} />
      </div>

      <Dropdown menu={{ items: profileMenuItems }} placement="topRight" trigger={["click"]}>
        <div className={styles.profile}>
          <Avatar
            size={28}
            src={avatarUrl || undefined}
            icon={!avatarUrl ? (isAdmin ? <CrownOutlined /> : <UserOutlined />) : undefined}
            className={styles.avatar}
          />
          <div className={styles.profileText}>
            <span className={styles.profileName}>{name}</span>
            <span className={styles.profileRole}>{role}</span>
          </div>
        </div>
      </Dropdown>

      <ProfileSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentName={displayName}
        currentAvatar={avatarUrl}
        onNameChange={setDisplayName}
      />
    </div>
  );
};
