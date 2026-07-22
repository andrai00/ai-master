"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel } from "@/src/features/chat-panel";
import { useBuilderSession } from "@/src/shared/api/builder/use-builder-session";
import { useBuilderMessages } from "@/src/shared/api/builder/use-builder-messages";
import { useSendBuilderMessage } from "@/src/shared/api/builder/use-send-message";
import { useDeleteBuilderMessage } from "@/src/shared/api/builder/use-delete-message";
import { useClearBuilderChat } from "@/src/shared/api/builder/use-clear-chat";
import { getBuilderMessagesAction, type IBuilderMessage } from "@/src/shared/actions/builder/get-messages";
import type { IMessage, IStepLabel } from "@/src/features/chat-panel/ui/chat-panel";
import type { ColumnsType } from "antd/es/table";

const PAGE_SIZE = 30;

export const BuilderChatView = () => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<IBuilderMessage[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const stepsRef = useRef<Map<string, IStepLabel[]>>(new Map());

  const { data: sessionData } = useBuilderSession();
  const sessionId = sessionData?.id;

  const { data: msgData, isLoading } = useBuilderMessages(sessionId, page);
  const sendMutation = useSendBuilderMessage();
  const deleteMutation = useDeleteBuilderMessage();
  const clearMutation = useClearBuilderChat();

  const mapMsg = (m: IBuilderMessage): IMessage => ({
    id: m.id,
    sender: m.role === "builder" ? "Builder" : "Админ",
    role: m.role,
    text: m.content,
    summarized: m.summarized,
    steps: stepsRef.current.get(m.id),
  });

  const messages: IMessage[] = (msgData && "messages" in msgData ? msgData.messages.map(mapMsg) : []);
  const total = (msgData && "total" in msgData ? msgData.total : 0);

  const handleSend = useCallback(
    async (content: string) => {
      if (!sessionId) return;
      setTyping(true);
      const result = await sendMutation.mutateAsync({ sessionId, content });
      if ("builderMessage" in result && result.steps?.length) {
        stepsRef.current.set(result.builderMessage.id, result.steps);
      }
      await new Promise((r) => setTimeout(r, 1000));
      queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] });
      setTyping(false);
    },
    [sessionId, sendMutation, queryClient]
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      const result = await deleteMutation.mutateAsync(messageId);
      if (!result.success) {
        notification.error({ title: result.error });
      }
    },
    [deleteMutation, notification]
  );

  const handleClear = useCallback(() => {
    if (sessionId) clearMutation.mutate(sessionId);
  }, [sessionId, clearMutation]);

  const openHistory = async () => {
    if (!sessionId) return;
    setHistoryOpen(true);
    setHistoryPage(1);
    await loadHistory(1);
  };

  const loadHistory = async (p: number) => {
    if (!sessionId) return;
    setHistoryLoading(true);
    setHistoryPage(p);
    const result = await getBuilderMessagesAction(sessionId, p, 30);
    if ("messages" in result) {
      setHistoryData(result.messages);
      setHistoryTotal(result.total);
    }
    setHistoryLoading(false);
  };

  const historyColumns: ColumnsType<IBuilderMessage> = [
    {
      title: t("chat.role") || "Роль",
      dataIndex: "role",
      width: 80,
      render: (role: string) => (role === "builder" ? "Builder" : "Админ"),
    },
    {
      title: t("chat.message") || "Сообщение",
      dataIndex: "content",
      render: (text: string) => (
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 500 }}>
          {text}
        </div>
      ),
    },
  ];

  return (
    <>
      <ChatPanel
        messages={messages}
        placeholder={t("chat.placeholder")}
        title={t("mode.builderChat")}
        hideShare
        onDelete={handleDelete}
        onHistoryClick={openHistory}
        onClearChat={handleClear}
        totalMessages={total}
        onSend={handleSend}
        sending={sendMutation.isPending}
        typing={typing}
      />
      <Modal
        title={t("chat.historyTitle") || "История чата"}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        centered
        width={640}
      >
        <Table
          dataSource={historyData}
          columns={historyColumns}
          rowKey="id"
          size="small"
          loading={historyLoading}
          pagination={{
            current: historyPage,
            total: historyTotal,
            pageSize: 30,
            showSizeChanger: false,
            onChange: loadHistory,
          }}
          showHeader={false}
          locale={{ emptyText: t("chat.noMessages") || "Нет сообщений" }}
        />
      </Modal>
    </>
  );
};
