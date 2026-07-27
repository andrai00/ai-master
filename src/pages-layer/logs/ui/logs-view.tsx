"use client";

import { Timeline, Empty, Tag, Typography } from "antd";
import { BulbOutlined, RobotOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useThoughtLogs } from "@/src/shared/api/admin/useThoughtLogs";
import { PageHeader } from "@/src/shared/ui/page-header";

const { Paragraph } = Typography;

export const LogsView = () => {
  const { t } = useTranslation();

  const { data: logs = [], isLoading } = useThoughtLogs();

  const items = logs.map((log) => ({
    color: log.agent === "builder" ? "blue" : "green",
    content: (
      <div>
        <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={log.agent === "builder" ? "blue" : "green"}>
            {log.agent === "builder" ? t("logs.agentBuilder") : t("logs.agentGameMaster")}
          </Tag>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {new Date(log.createdAt).toLocaleString("ru")}
          </span>
        </div>
        <Paragraph
          style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 0 }}
          code
        >
          {log.content}
        </Paragraph>
      </div>
    ),
  }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={t("logs.title")} />
      <div style={{ padding: 24, maxWidth: 960, margin: "0 auto", width: "100%", overflow: "auto", flex: 1 }}>
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>
          {t("logs.loading")}
        </div>
      ) : items.length === 0 ? (
        <Empty description={t("logs.empty")} />
      ) : (
        <Timeline items={items} />
      )}
    </div>
    </div>
  );
};
