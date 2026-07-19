"use client";

import { Modal, Input, Button, App, Upload, Popconfirm } from "antd";
import { UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
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
      notification.success({ title: "Профиль обновлён" });
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
      notification.success({ title: "Пароль изменён" });
      setCurrentPw("");
      setNewPw("");
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleAvatarUpload = async (file: RcFile) => {
    if (file.size > 5 * 1024 * 1024) {
      notification.error({ title: "Файл слишком большой (макс. 5MB)" });
      return false;
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload-avatar", { method: "POST", body: formData });
    const data = await res.json();

    if (data.avatarPath) {
      setAvatar(data.avatarPath);
    } else {
      notification.error({ title: data.error || "Ошибка загрузки" });
    }

    return false;
  };

  const handleDeleteAvatar = async () => {
    setAvatar("");
    await updateProfileAction(name, "");
    onProfileUpdated(name, "");
    notification.success({ title: "Аватар удалён" });
  };

  const hasAvatar = avatar && !avatar.includes("undefined");

  return (
    <Modal
      title="Настройки профиля"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={400}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>Аватар</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Upload accept="image/*" showUploadList={false} beforeUpload={handleAvatarUpload}>
              <Button icon={<UploadOutlined />}>Загрузить</Button>
            </Upload>
            {hasAvatar && (
              <>
                <Popconfirm
                  title="Удалить аватар?"
                  onConfirm={handleDeleteAvatar}
                  okText="Да"
                  cancelText="Нет"
                >
                  <Button icon={<DeleteOutlined />} danger size="small" />
                </Popconfirm>
                <img
                  src={avatar}
                  alt="avatar"
                  style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
                />
              </>
            )}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>Отображаемое имя</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button loading={saving} onClick={handleSaveProfile}>
          Сохранить
        </Button>

        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />

        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "#999", fontWeight: 600 }}>Сменить пароль</div>
        </div>
        <Input.Password
          placeholder="Текущий пароль"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
        />
        <Input.Password
          placeholder="Новый пароль"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <Button
          loading={pwSaving}
          onClick={handleChangePassword}
          disabled={!currentPw || !newPw}
        >
          Сменить пароль
        </Button>
      </div>
    </Modal>
  );
};
