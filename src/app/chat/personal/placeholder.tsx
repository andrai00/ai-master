"use client";

import { useTranslation } from "react-i18next";
import "@/src/shared/config/i18n";

export const PersonalChatPlaceholder = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 8,
        color: "var(--text-muted)",
      }}
    >
      <span style={{ fontSize: 14 }}>{t("chatPersonal.title")}</span>
      <span style={{ fontSize: 12 }}>{t("chatPersonal.subtitle")}</span>
    </div>
  );
};
