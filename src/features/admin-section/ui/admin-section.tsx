"use client";

import { Button, App, Tooltip } from "antd";
import { UserOutlined, EditOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useActiveMode } from "@/src/shared/api/admin/use-active-mode";
import { useSetMasterMode } from "@/src/shared/api/admin/use-set-master-mode";
import styles from "./admin-section.module.css";

export const AdminSection = () => {
  const { t } = useTranslation();
  const { modal, notification } = App.useApp();
  const router = useRouter();
  const { data: modeData } = useActiveMode();
  const setModeMutation = useSetMasterMode();

  const isDev = modeData?.mode === "development";

  const handleToggle = () => {
    const newMode = isDev ? "game" : "development";

    modal.confirm({
      title: isDev ? t("mode.titleToGame") : t("mode.titleToDev"),
      content: isDev ? t("mode.confirmToGame") : t("mode.confirmToDev"),
      okText: isDev ? t("mode.okToGame") : t("mode.okToDev"),
      cancelText: t("common.cancel"),
      centered: true,
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

      <button className={styles.row} onClick={() => router.push("/admin/users")}>
        <UserOutlined className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t("mode.users")}</span>
      </button>

      <div className={styles.modeRow}>
        <Tooltip title={isDev ? t("mode.hintToGame") : t("mode.hintToDev")} placement="right">
          <Button
            size="small"
            type="default"
            icon={isDev ? <PlayCircleOutlined /> : <EditOutlined />}
            onClick={handleToggle}
            loading={setModeMutation.isPending}
            className={styles.modeBtn}
          >
            {isDev ? t("mode.btnToGame") : t("mode.btnToDev")}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
