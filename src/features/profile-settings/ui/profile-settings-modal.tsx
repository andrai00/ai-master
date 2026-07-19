"use client";

import { Modal, Input, Button, App, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
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
  onNameChange: (name: string) => void;
}

export const ProfileSettingsModal = ({
  open,
  onClose,
  currentName,
  currentAvatar,
  onNameChange,
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
      onNameChange(result.displayName || name);
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

  const handleAvatarUpload = (file: RcFile): boolean => {
    if (file.size > 200 * 1024) {
      notification.error({ title: "Файл слишком большой (макс. 200KB)" });
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
    return false;
  };

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
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleAvatarUpload}>
            <Button icon={<UploadOutlined />}>Загрузить</Button>
          </Upload>
          {avatar && (
            <img
              src={avatar}
              alt="avatar"
              style={{ width: 48, height: 48, borderRadius: "50%", marginTop: 8, objectFit: "cover" }}
            />
          )}
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
