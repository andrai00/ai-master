"use client";

import { Modal, Button, Upload } from "antd";
import { ImportOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

interface IImportMasterModalProps {
  open: boolean;
  onClose: () => void;
}

export const ImportMasterModal = ({ open, onClose }: IImportMasterModalProps) => {
  const { t } = useTranslation();

  const handleImport = () => {
    // TODO: implement import — upload dump, create new Master from it
  };

  return (
    <Modal
      title={t("mode.importTitle")}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>{t("common.cancel")}</Button>,
        <Button key="import" type="primary" icon={<ImportOutlined />} onClick={handleImport}>
          {t("mode.importBtn")}
        </Button>,
      ]}
      centered
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
          {t("mode.importDesc")}
        </p>
        <Upload.Dragger
          accept=".json,.db"
          maxCount={1}
          beforeUpload={() => false}
          style={{ padding: "16px 0" }}
        >
          <p style={{ marginBottom: 4 }}>
            <UploadOutlined style={{ fontSize: 20, color: "var(--text-dim)" }} />
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
            {t("mode.importDrag")}
          </p>
        </Upload.Dragger>
        <div style={{
          padding: "10px 12px",
          background: "var(--bg-hover)",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--text-dim)",
        }}>
          <div style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: 4 }}>
            {t("mode.importCreates")}:
          </div>
          <div>• {t("mode.importNewGame")}</div>
          <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
            {t("mode.importNote")}
          </div>
        </div>
      </div>
    </Modal>
  );
};
