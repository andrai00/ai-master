"use client";

import { Modal, Input, Button, App, Upload, Popconfirm } from "antd";
import { UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RcFile } from "antd/es/upload";
import {
  updateProfileAction,
  changePasswordAction,
} from "@/src/shared/actions/profile/update-profile";

interface IProfileSettingsProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentAvatar: string;
  onProfileUpdated: (name: string, avatar: string) => void;
}

export const ProfileSettingsModal = ({
  open,
  onClose,
  currentName,
  currentAvatar,
  onProfileUpdated,
}: IProfileSettingsProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const { notification } = App.useApp();

  const handleSaveProfile = async () => {
    setSaving(true);
    const result = await updateProfileAction(name, avatar);
    setSaving(false);
    if (result.success) {
      onProfileUpdated(result.displayName || name, avatar);
      notification.success({ title: t("profileModal.profileUpdated") });
      onClose();
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleChangePassword = async () => {
    setPwSaving(true);
    const result = await changePasswordAction(currentPw, newPw);
    setPwSaving(false);
    if (result.success) {
      notification.success({ title: t("profileModal.passwordChanged") });
      setCurrentPw("");
      setNewPw("");
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleAvatarUpload = async (file: RcFile) => {
    if (file.size > 5 * 1024 * 1024) {
      notification.error({ title: t("profileModal.avatarTooBig") });
      return false;
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload-avatar", { method: "POST", body: formData });
    const data = await res.json();

    if (data.avatarPath) {
      setAvatar(data.avatarPath);
    } else {
      notification.error({ title: data.error || t("profileModal.avatarUploadError") });
    }

    return false;
  };

  const handleDeleteAvatar = async () => {
    setAvatar("");
    await fetch("/api/delete-avatar", { method: "POST" });
    await updateProfileAction(name, "");
    onProfileUpdated(name, "");
    notification.success({ title: t("profileModal.avatarDeleted") });
  };

  const hasAvatar = avatar && !avatar.includes("undefined");

  return (
    <Modal
      title={t("profileModal.title")}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={400}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("profileModal.avatar")}</div>
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleAvatarUpload}>
            <Button icon={<UploadOutlined />}>{t("common.upload")}</Button>
          </Upload>
          {hasAvatar && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <img src={avatar} alt="avatar" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
              <Popconfirm
                title={t("profileModal.avatarDeleteConfirm")}
                onConfirm={handleDeleteAvatar}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
              >
                <Button icon={<DeleteOutlined />} danger size="small">{t("profileModal.avatarDelete")}</Button>
              </Popconfirm>
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("profileModal.displayName")}</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button loading={saving} onClick={handleSaveProfile}>
          {t("common.save")}
        </Button>

        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999", fontWeight: 600 }}>{t("profileModal.passwordTitle")}</div>
        </div>
        <Input.Password
          placeholder={t("profileModal.currentPassword")}
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
        />
        <Input.Password
          placeholder={t("profileModal.newPassword")}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <Button
          loading={pwSaving}
          onClick={handleChangePassword}
          disabled={!currentPw || !newPw}
        >
          {t("profileModal.changePassword")}
        </Button>
      </div>
    </Modal>
  );
};
