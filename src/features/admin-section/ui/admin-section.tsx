"use client";

import { App } from "antd";
import { UserOutlined, EditOutlined, PlayCircleOutlined, ImportOutlined, ExportOutlined, FileTextOutlined, SettingOutlined, MessageOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveMode } from "@/src/shared/api/admin/useActiveMode";
import { useSetMasterMode } from "@/src/shared/api/admin/useSetMasterMode";
import { ImportMasterModal } from "./import-master-modal";
import { ExportMasterModal } from "./export-master-modal";
import styles from "./admin-section.module.css";

export const AdminSection = () => {
  const { t } = useTranslation();
  const { modal, notification } = App.useApp();
  const pathname = usePathname();
  const { data: modeData } = useActiveMode();

  const isActive = (route: string) => pathname.startsWith(route);
  const setModeMutation = useSetMasterMode();

  const isDev = modeData?.mode === "development";
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const handleToggle = () => {
    const newMode = isDev ? "game" : "development";

    modal.confirm({
      title: isDev ? t("mode.titleToGame") : t("mode.titleToDev"),
      content: isDev ? t("mode.confirmToGame") : t("mode.confirmToDev"),
      okText: isDev ? t("mode.okToGame") : t("mode.okToDev"),
      cancelText: t("common.cancel"),
      centered: true,
      mask: { closable: true },
      onOk: async () => {
        const result = await setModeMutation.mutateAsync(newMode);
        if (result.success) {
          notification.success({
            title: isDev ? t("mode.switchedToGame") : t("mode.switchedToDev"),
          });
        }
      },
    });
  };

  return (
    <div className={styles.section}>
      <div className={styles.label}>{t("mode.adminSection")}</div>

      <Link
        href="/admin/users"
        className={`${styles.row} ${isActive("/admin/users") ? styles.rowActive : ""}`}
      >
        <UserOutlined className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t("mode.users")}</span>
      </Link>
      <Link
        href="/admin/ai-settings"
        className={`${styles.row} ${isActive("/admin/ai-settings") ? styles.rowActive : ""}`}
      >
        <SettingOutlined className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t("mode.aiSettings")}</span>
      </Link>

      <div className={styles.modeRow}>
        <button className={`${styles.inlineBtn} ${styles.modeBtn}`} onClick={handleToggle}>
          {isDev ? <PlayCircleOutlined /> : <EditOutlined />}
          <span>{isDev ? t("mode.btnToGame") : t("mode.btnToDev")}</span>
        </button>
      </div>

      {isDev && (
        <>
          <Link href="/admin/builder" className={`${styles.row} ${isActive("/admin/builder") ? styles.rowActive : ""}`}>
            <MessageOutlined className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t("mode.builderChat")}</span>
          </Link>
          <div className={styles.inlineRow}>
            <button className={styles.inlineBtn} onClick={() => setImportOpen(true)}>
              <ImportOutlined />
              <span>{t("mode.importMaster")}</span>
            </button>
            <button className={styles.inlineBtn} onClick={() => setExportOpen(true)}>
              <ExportOutlined />
              <span>{t("mode.exportMaster")}</span>
            </button>
          </div>
        </>
      )}
      {isDev && (
        <Link href="/admin/documents"
          className={`${styles.row} ${isActive("/admin/documents") ? styles.rowActive : ""}`}
        >
          <FileTextOutlined className={styles.rowIcon} />
          <span className={styles.rowLabel}>{t("mode.documents")}</span>
        </Link>
      )}
      <ImportMasterModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportMasterModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
};
