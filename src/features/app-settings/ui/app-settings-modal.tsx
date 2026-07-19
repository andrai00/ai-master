"use client";

import { Modal, Switch } from "antd";
import { useTheme } from "@/src/app-layer/theme-context";

interface IAppSettingsProps {
  open: boolean;
  onClose: () => void;
}

export const AppSettingsModal = ({ open, onClose }: IAppSettingsProps) => {
  const { mode, setMode } = useTheme();

  const handleToggle = (checked: boolean) => {
    setMode(checked ? "dark" : "light");
  };

  return (
    <Modal title="Настройки" open={open} onCancel={onClose} footer={null} centered width={360}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <span style={{ fontSize: 14 }}>Тёмная тема</span>
        <Switch checked={mode === "dark"} onChange={handleToggle} />
      </div>
    </Modal>
  );
};
