"use client";

import { Modal, Button, Select } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/src/shared/lib/theme";
import { saveLanguage, type TLanguage } from "@/src/shared/config/i18n";

interface IAppSettingsProps {
  open: boolean;
  onClose: () => void;
}

export const AppSettingsModal = ({ open, onClose }: IAppSettingsProps) => {
  const { mode, setMode } = useTheme();
  const { t, i18n } = useTranslation();

  const handleToggle = () => {
    setMode(mode === "dark" ? "light" : "dark");
  };

  const handleLangChange = (value: TLanguage) => {
    i18n.changeLanguage(value);
    saveLanguage(value);
  };

  return (
    <Modal title={t("settings.title")} open={open} onCancel={onClose} footer={null} centered width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14 }}>{t("settings.darkTheme")}</span>
          <Button icon={<BulbOutlined />} onClick={handleToggle}>
            {mode === "dark" ? t("settings.themeLight") : t("settings.themeDark")}
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14 }}>{t("settings.language")}</span>
          <Select
            value={i18n.language as TLanguage}
            onChange={handleLangChange}
            style={{ width: 120 }}
            options={[
              { value: "ru", label: t("settings.langRu") },
              { value: "en", label: t("settings.langEn") },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
};
