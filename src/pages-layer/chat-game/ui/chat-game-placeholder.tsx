"use client";

import { useTranslation } from "react-i18next";

export function ChatGamePlaceholder() {
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
      <span style={{ fontSize: 14 }}>{t("tabs.commonChat")}</span>
      <span style={{ fontSize: 12 }}>{t("chat.placeholderEmpty")}</span>
    </div>
  );
}
