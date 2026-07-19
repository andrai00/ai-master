"use client";

import { Avatar, Tooltip, App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  CrownOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import { useState, useEffect, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { ChatNav } from "@/src/features/sidebar-nav";
import { FileTree } from "@/src/features/file-tree";
import { ProfileSettingsModal } from "@/src/features/profile-settings";
import { AppSettingsModal } from "@/src/features/app-settings";
import { logoutAction } from "@/src/shared/actions/auth/logout";
import type { ISessionPayload } from "@/src/shared/lib/auth/session";
import styles from "./sidebar.module.css";

interface ISidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: ISessionPayload;
}

export const Sidebar = ({ collapsed, onToggle, user }: ISidebarProps) => {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || user?.login || t("sidebar.guest"));
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    modal.confirm({
      title: t("profile.logoutConfirm"),
      content: t("profile.logoutMessage"),
      okText: t("profile.logout"),
      cancelText: t("common.cancel"),
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
      key: "profile",
      icon: <IdcardOutlined />,
      label: t("profile.settings"),
      onClick: () => setSettingsOpen(true),
    },
    {
      key: "app",
      icon: <SettingOutlined />,
      label: t("profile.appSettings"),
      onClick: () => setAppSettingsOpen(true),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: t("profile.logout"),
      danger: true,
      onClick: handleLogout,
    },
  ];

  const isAdmin = user?.role === "admin";
  const baseAvatarUrl = user ? `/api/avatar/${user.userId}` : "";
  const avatarUrl = baseAvatarUrl ? `${baseAvatarUrl}?v=${avatarVersion}` : "";
  const name = displayName;
  const role = user?.role === "admin" ? t("profile.role_admin") : t("profile.role_player");

  const handleProfileUpdated = (newName: string) => {
    setDisplayName(newName);
    setAvatarVersion((v) => v + 1);
  };

  const settingsModal = (
    <Fragment>
      <ProfileSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentName={displayName}
        currentAvatar={avatarUrl}
        login={user?.login || ""}
        onProfileUpdated={handleProfileUpdated}
      />
      <AppSettingsModal open={appSettingsOpen} onClose={() => setAppSettingsOpen(false)} />
    </Fragment>
  );

  if (collapsed) {
    return (
      <Fragment>
        <div className={styles.collapsed}>
          <button className={styles.collapsedBtn} onClick={onToggle}>
            <MenuUnfoldOutlined />
          </button>
          <ChatNav collapsed />
          <div className={styles.collapsedDivider} />
          <Tooltip title={t("sidebar.expand")} placement="right">
            <button className={styles.collapsedIcon} onClick={onToggle}>
              <UnorderedListOutlined />
            </button>
          </Tooltip>
          <div className={styles.collapsedSpacer} />
          <Dropdown menu={{ items: profileMenuItems }} placement="topRight" trigger={["click"]}>
            <div className={styles.collapsedAvatar}>
              <Avatar size={26} icon={isAdmin ? <CrownOutlined /> : <UserOutlined />} />
            </div>
          </Dropdown>
        </div>
        {settingsModal}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.logo}>{t("sidebar.logo")}</span>
          </div>
        <Tooltip title={t("sidebar.collapse")} placement="right">
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
              src={mounted && avatarUrl ? avatarUrl : undefined}
              icon={isAdmin ? <CrownOutlined /> : <UserOutlined />}
              className={styles.avatar}
            />
            <div className={styles.profileText}>
              <span className={styles.profileName}>{name}</span>
              <span className={styles.profileRole}>{role}</span>
            </div>
          </div>
        </Dropdown>
      </div>
      {settingsModal}
    </Fragment>
  );
};
