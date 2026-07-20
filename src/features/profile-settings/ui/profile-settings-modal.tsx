"use client";

import { Modal, Input, Button, App, Upload, Popconfirm } from "antd";
import { CameraOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateProfile } from "@/src/shared/api/profile/use-update-profile";
import { useChangePassword } from "@/src/shared/api/profile/use-change-password";
import type { RcFile } from "antd/es/upload";

interface IProfileSettingsProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentAvatar: string;
  login: string;
  onProfileUpdated: (name: string, avatar: string) => void;
}

export const ProfileSettingsModal = ({
  open,
  onClose,
  currentName,
  currentAvatar,
  login,
  onProfileUpdated,
}: IProfileSettingsProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const { notification } = App.useApp();
  const updateProfile = useUpdateProfile();

  const handleSave = () => {
    updateProfile.mutate({ name, avatar }, {
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
        <AvatarEditor avatar={avatar} onChange={setAvatar} />

        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("profileModal.login")}</div>
          <Input value={login} disabled />
        </div>

        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("profileModal.displayName")}</div>
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

function AvatarEditor({ avatar, onChange }: { avatar: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const { notification } = App.useApp();

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
    setEditorOpen(false);
  };

  const hasAvatar = avatar && !avatar.includes("undefined");

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
          <>
            <img src={avatar} alt="" style={{ width: 72, height: 72, objectFit: "cover" }} />
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
              <CameraOutlined style={{ color: "#fff", fontSize: 20 }} />
            </div>
          </>
        ) : (
          <CameraOutlined style={{ color: "var(--text-muted)", fontSize: 24 }} />
        )}
      </div>

      <Modal
        title={t("profileModal.avatar")}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        footer={null}
        centered
        width={300}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", paddingTop: 4 }}>
          {hasAvatar && (
            <img src={avatar} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", marginBottom: 8 }} />
          )}
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload}>
            <Button block>{t("common.upload")}</Button>
          </Upload>
          {hasAvatar && (
            <Popconfirm
              title={t("profileModal.avatarDeleteConfirm")}
              onConfirm={handleDelete}
                okText={t("admin.yes")}
                cancelText={t("admin.no")}
            >
              <Button icon={<DeleteOutlined />} danger block>
                {t("profileModal.avatarDelete")}
              </Button>
            </Popconfirm>
          )}
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
