"use client";

import { Modal, Button, Upload, App } from "antd";
import { ImportOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface IImportMasterModalProps {
  open: boolean;
  onClose: () => void;
}

export const ImportMasterModal = ({ open, onClose }: IImportMasterModalProps) => {
  const { t } = useTranslation();
  const { notification, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const form = new FormData();
      form.append("file", file);

      // Check existing count
      const checkRes = await fetch("/api/builder/import", {
        method: "POST",
        body: form,
        headers: { "x-confirm-overwrite": "false" },
      });

      if (checkRes.status === 409) {
        const data = await checkRes.json();
        const confirmed = await new Promise<boolean>((resolve) => {
          modal.confirm({
            title: t("documents.importConfirmTitle"),
            content: t("documents.importConfirmDesc", { existing: data.existingCount, importing: data.importCount }),
            okText: t("documents.importConfirmOk"),
            cancelText: t("common.cancel"),
            okButtonProps: { danger: true },
            mask: { closable: true },
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) { setImporting(false); return; }

        const importForm = new FormData();
        importForm.append("file", file);
        const importRes = await fetch("/api/builder/import", {
          method: "POST",
          body: importForm,
          headers: { "x-confirm-overwrite": "true" },
        });
        if (!importRes.ok) {
          const err = await importRes.json().catch(() => ({ error: "errors.unknownError" }));
          notification.error({ title: t(err.error) });
          setImporting(false);
          return;
        }
        const importData = await importRes.json();
        notification.success({ title: t("documents.importSuccess", { count: importData.imported }) });
      } else if (checkRes.ok) {
        const data = await checkRes.json();
        notification.success({ title: t("documents.importSuccess", { count: data.imported }) });
      } else {
        const err = await checkRes.json().catch(() => ({ error: "errors.unknownError" }));
        notification.error({ title: t(err.error) });
      }
    } catch {
      notification.error({ title: t("errors.unknownError") });
    }

    setImporting(false);
    setFile(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
    queryClient.invalidateQueries({ queryKey: ["game", "playerDocuments"] });
    onClose();
  };

  return (
    <Modal
      title={t("mode.importTitle")}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>{t("common.cancel")}</Button>,
        <Button key="import" type="primary" icon={<ImportOutlined />} onClick={handleImport} loading={importing} disabled={!file}>
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
          accept=".json"
          maxCount={1}
          beforeUpload={(f) => { setFile(f); return false; }}
          onRemove={() => setFile(null)}
          style={{ padding: "16px 0" }}
        >
          <p style={{ marginBottom: 4 }}>
            <UploadOutlined style={{ fontSize: 20, color: "var(--text-dim)" }} />
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
            {file ? file.name : t("mode.importDrag")}
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
