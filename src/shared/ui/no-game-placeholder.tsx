"use client";

import { Result } from "antd";
import { useTranslation } from "react-i18next";

interface INoGamePlaceholderProps {
  page: "builder" | "documents";
}

export function NoGamePlaceholder({ page }: INoGamePlaceholderProps) {
  const { t } = useTranslation();
  const prefix = page === "builder" ? "builder" : "documents";

  return (
    <Result
      status="info"
      title={t(`noGame.${page}.title`)}
      subTitle={t(`noGame.${page}.description`)}
    />
  );
}
