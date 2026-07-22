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
import { useQueryClient } from "@tanstack/react-query";
import { ChatNav } from "@/src/features/sidebar-nav";
import { FileTree } from "@/src/features/file-tree";
import { GameSelector, GameSelectorCollapsed } from "@/src/features/game-selector";
import { AdminSection } from "@/src/features/admin-section";
import { useActiveMode } from "@/src/shared/api/admin/use-active-mode";
import { useUserAvatar } from "@/src/shared/api/profile/use-user-avatar";
import { ProfileSettingsModal } from "@/src/features/profile-settings";
import { AppSettingsModal } from "@/src/features/app-settings";
import { logoutAction } from "@/src/shared/actions/auth/logout";
import type { ISessionPayload } from "@/src/shared/lib/auth/session";
import styles from "./sidebar.module.css";

interface ISidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: ISessionPayload;
  onGameChange?: () => void;
}

export const Sidebar = ({ collapsed, onToggle, user, onGameChange }: ISidebarProps) => {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || user?.login || t("sidebar.guest"));
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
      mask: { closable: true },
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
  const { data: modeData } = isAdmin ? useActiveMode() : { data: null };
  const isDev = modeData?.mode === "development";
  const { data: avatarUri } = useUserAvatar(user?.userId);
  const name = displayName;
  const role = user?.role === "admin" ? t("profile.role_admin") : t("profile.role_player");

  const handleProfileUpdated = (newName: string) => {
    setDisplayName(newName);
    queryClient.invalidateQueries({ queryKey: ["avatar", user?.userId] });
  };

  const settingsModal = (
    <Fragment>
      <ProfileSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentName={displayName}
        currentAvatar={avatarUri || ""}
        login={user?.login || ""}
        userId={user?.userId || ""}
        role={user?.role || "player"}
        onProfileUpdated={handleProfileUpdated}
      />
      <AppSettingsModal open={appSettingsOpen} onClose={() => setAppSettingsOpen(false)} />
    </Fragment>
  );

  if (collapsed) {
    return (
      <Fragment>
        <div className={styles.collapsed}>
          <GameSelectorCollapsed isAdmin={isAdmin} onGameChange={onGameChange || (() => {})} />
          <button className={styles.collapsedBtn} onClick={onToggle}>
            <MenuUnfoldOutlined />
          </button>
          <ChatNav collapsed isDev={isDev} />
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
            <GameSelector isAdmin={isAdmin} onGameChange={onGameChange || (() => {})} />
          </div>
        <Tooltip title={t("sidebar.collapse")} placement="right">
          <button className={styles.collapseBtn} onClick={onToggle}>
            <MenuFoldOutlined />
          </button>
        </Tooltip>
        </div>

        <ChatNav isDev={isDev} />

        {isAdmin && <AdminSection />}

        <div className={styles.divider} />

        <div className={styles.tree}>
          <FileTree isAdmin={isAdmin} />
        </div>

        <Dropdown menu={{ items: profileMenuItems }} placement="topRight" trigger={["click"]}>
          <div className={styles.profile}>
            <Avatar
              size={28}
              src={mounted && avatarUri ? avatarUri : undefined}
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
