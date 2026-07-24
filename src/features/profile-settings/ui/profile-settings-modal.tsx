"use client";

import { Modal, Input, Button, App, Upload, Popconfirm, Avatar, Tooltip } from "antd";
import { CameraOutlined, DeleteOutlined, CrownOutlined, UserOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateProfile } from "@/src/shared/api/profile/useUpdateProfile";
import { useChangePassword } from "@/src/shared/api/profile/useChangePassword";
import { useUserAvatar } from "@/src/shared/api/profile/useUserAvatar";
import { useQueryClient } from "@tanstack/react-query";
import type { RcFile } from "antd/es/upload";

interface IProfileSettingsProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentAvatar: string;
  login: string;
  userId: string;
  role: string;
  onProfileUpdated: (name: string, avatar: string) => void;
}

export const ProfileSettingsModal = ({
  open,
  onClose,
  currentName,
  currentAvatar,
  login,
  userId,
  role,
  onProfileUpdated,
}: IProfileSettingsProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const { notification } = App.useApp();
  const updateProfile = useUpdateProfile();

  const handleSave = () => {
    updateProfile.mutate({ name }, {
      onSuccess: (result) => {
        if (result.success) {
          onProfileUpdated(result.displayName || name, avatar);
          notification.success({ title: t("profileModal.profileUpdated") });
          onClose();
        }
      },
    });
  };

  return (
    <Modal title={t("profileModal.title")} open={open} onCancel={onClose} footer={null} centered width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <AvatarEditor userId={userId} role={role} onChange={setAvatar} />

        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>{t("profileModal.login")}</div>
          <Input value={login} disabled />
        </div>

        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>{t("profileModal.displayName")}</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>

        <Button type="primary" loading={updateProfile.isPending} onClick={handleSave} block style={{ marginTop: 4 }}>
          {t("common.save")}
        </Button>

        <div style={{ width: "100%", height: 1, background: "var(--border)" }} />

        <PasswordChangeModal />
      </div>
    </Modal>
  );
};

function AvatarEditor({ userId, role, onChange }: { userId: string; role?: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentAvatarUri } = useUserAvatar(userId);
  const [editorOpen, setEditorOpen] = useState(false);
  const { notification } = App.useApp();

  const avatar = currentAvatarUri || "";
  const hasAvatar = !!avatar;

  const handleUpload = async (file: RcFile) => {
    if (file.size > 5 * 1024 * 1024) {
      notification.error({ title: t("profileModal.avatarTooBig") });
      return false;
    }
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload-avatar", { method: "POST", body: formData });
    const data = await res.json();
    if (data.avatarPath) {
      queryClient.invalidateQueries({ queryKey: ["avatar", userId] });
      onChange(data.avatarPath);
      setEditorOpen(false);
    } else {
      notification.error({ title: data.error || t("profileModal.avatarUploadError") });
    }
    return false;
  };

  const handleDelete = async () => {
    onChange("");
    await fetch("/api/delete-avatar", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["avatar", userId] });
    setEditorOpen(false);
  };

  return (
    <>
        <div
          onClick={() => setEditorOpen(true)}
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            cursor: "pointer",
            background: "var(--bg-hover)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {hasAvatar ? (
            <Avatar size={72} src={avatar} style={{ flexShrink: 0 }} />
          ) : (
            <Avatar size={72} icon={role === "admin" ? <CrownOutlined /> : <UserOutlined />} style={{ flexShrink: 0 }} />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
          >
            <CameraOutlined style={{ color: "var(--text-on-accent)", fontSize: 20 }} />
          </div>
        </div>

      <Modal
        title={t("profileModal.avatar")}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        footer={null}
        centered
        width={280}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", paddingTop: 4 }}>
          <Avatar size={80} src={hasAvatar ? avatar : undefined} icon={hasAvatar ? undefined : (role === "admin" ? <CrownOutlined /> : <UserOutlined />)} />
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload} style={{ flex: 1 }}>
              <Button icon={<CameraOutlined />} block>{t("common.upload")}</Button>
            </Upload>
            {hasAvatar && (
              <Popconfirm
                title={t("profileModal.avatarDeleteConfirm")}
                onConfirm={handleDelete}
                okText={t("admin.yes")}
                cancelText={t("admin.no")}
              >
                <Button icon={<DeleteOutlined />} danger>{t("common.delete")}</Button>
              </Popconfirm>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function PasswordChangeModal() {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const [open, setOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const changePassword = useChangePassword();

  const handleChange = () => {
    if (newPw !== confirmPw) {
      notification.error({ title: t("profileModal.passwordMismatch") });
      return;
    }
    changePassword.mutate(newPw, {
      onSuccess: (result) => {
        if (result.success) {
          notification.success({ title: t("profileModal.passwordChanged") });
          setNewPw(""); setConfirmPw(""); setOpen(false);
        }
      },
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} block>{t("profileModal.changePassword")}</Button>
      <Modal
        title={t("profileModal.passwordTitle")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleChange}
        confirmLoading={changePassword.isPending}
        okText={t("profileModal.changePassword")}
        cancelText={t("common.cancel")}
        centered
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input.Password
            placeholder={t("profileModal.newPassword")}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <Input.Password
            placeholder={t("profileModal.confirmPassword")}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
