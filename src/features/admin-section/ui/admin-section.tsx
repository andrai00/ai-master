"use client";

import { App } from "antd";
import { UserOutlined, EditOutlined, PlayCircleOutlined, CodeOutlined, ImportOutlined, ExportOutlined, FileTextOutlined, BulbOutlined, SettingOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, usePathname } from "next/navigation";
import { useActiveMode } from "@/src/shared/api/admin/use-active-mode";
import { useSetMasterMode } from "@/src/shared/api/admin/use-set-master-mode";
import { ImportMasterModal } from "./import-master-modal";
import { ExportMasterModal } from "./export-master-modal";
import styles from "./admin-section.module.css";

export const AdminSection = () => {
  const { t } = useTranslation();
  const { modal, notification } = App.useApp();
  const router = useRouter();
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

      <button
        className={`${styles.row} ${isActive("/admin/users") ? styles.rowActive : ""}`}
        onClick={() => router.push("/admin/users")}
      >
        <UserOutlined className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t("mode.users")}</span>
      </button>
      <button
        className={`${styles.row} ${isActive("/admin/ai-settings") ? styles.rowActive : ""}`}
        onClick={() => router.push("/admin/ai-settings")}
      >
        <SettingOutlined className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t("mode.aiSettings")}</span>
      </button>

      <div className={styles.modeRow}>
        <button className={`${styles.inlineBtn} ${styles.modeBtn}`} onClick={handleToggle}>
          {isDev ? <PlayCircleOutlined /> : <EditOutlined />}
          <span>{isDev ? t("mode.btnToGame") : t("mode.btnToDev")}</span>
        </button>
      </div>

      {isDev && (
        <>
          <button className={`${styles.row} ${isActive("/admin/builder") ? styles.rowActive : ""}`} onClick={() => router.push("/admin/builder")}>
            <CodeOutlined className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t("mode.builderChat")}</span>
          </button>
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
        <button
          className={`${styles.row} ${isActive("/admin/documents") ? styles.rowActive : ""}`}
          onClick={() => router.push("/admin/documents")}
        >
          <FileTextOutlined className={styles.rowIcon} />
          <span className={styles.rowLabel}>{t("mode.documents")}</span>
        </button>
      )}
      {isDev && (
        <button
          className={`${styles.row} ${isActive("/admin/logs") ? styles.rowActive : ""}`}
          onClick={() => router.push("/admin/logs")}
        >
          <BulbOutlined className={styles.rowIcon} />
          <span className={styles.rowLabel}>{t("mode.logs")}</span>
        </button>
      )}
      <ImportMasterModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportMasterModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
};
