"use client";

import { Timeline, Empty, Tag } from "antd";
import { BulbOutlined, RobotOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listThoughtLogsAction } from "@/src/shared/actions/admin/list-thought-logs";

export const LogsView = () => {
  const { t } = useTranslation();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin", "thoughtLogs"],
    queryFn: listThoughtLogsAction,
    refetchInterval: 5000,
  });

  const items = logs.map((log) => ({
    color: log.agent === "builder" ? "blue" : "green",
    dot: log.agent === "builder" ? <BulbOutlined /> : <RobotOutlined />,
    content: (
      <div>
        <div style={{ marginBottom: 4 }}>
          <Tag color={log.agent === "builder" ? "blue" : "green"}>
            {log.agent === "builder" ? "Builder" : "Game Master"}
          </Tag>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {new Date(log.createdAt).toLocaleString("ru")}
          </span>
        </div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {log.content}
        </div>
      </div>
    ),
  }));

  const timelineItems = items;

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto", height: "100%", overflow: "auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
        {t("logs.title")}
      </h2>
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>
          {t("logs.loading")}
        </div>
      ) : timelineItems.length === 0 ? (
        <Empty description={t("logs.empty")} />
      ) : (
        <Timeline items={timelineItems} />
      )}
    </div>
  );
};
