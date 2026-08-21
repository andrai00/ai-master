"use client";

import { Modal, Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

interface IExportMasterModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExportMasterModal = ({ open, onClose }: IExportMasterModalProps) => {
  const { t } = useTranslation();

  const handleExport = async () => {
    try {
      const res = await fetch("/api/builder/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-master-export.json";
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      // silently fail
    }
  };

  return (
    <Modal
      title={t("mode.exportTitle")}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>{t("common.cancel")}</Button>,
        <Button key="export" type="primary" icon={<ExportOutlined />} onClick={handleExport}>
          {t("mode.exportBtn")}
        </Button>,
      ]}
      centered
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
          {t("mode.exportDesc")}
        </p>
        <div style={{
          padding: "10px 12px",
          background: "var(--bg-hover)",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--text-dim)",
        }}>
          <div style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: 4 }}>
            {t("mode.exportIncludes")}:
          </div>
          <div>• {t("mode.exportGlossary")}</div>
          <div>• {t("mode.exportBrain")}</div>
          <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
            {t("mode.exportExcludes")}:
          </div>
          <div style={{ color: "var(--text-muted)" }}>• {t("mode.exportNoGameData")}</div>
        </div>
      </div>
    </Modal>
  );
};
