"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App, notification as antNotification } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel, type IMessage } from "@/src/features/chat-panel";
import { usePersonalSession } from "@/src/shared/api/game-master/use-personal-session";
import { usePersonalMessages } from "@/src/shared/api/game-master/use-personal-messages";
import { useSendPersonalMessage } from "@/src/shared/api/game-master/use-send-personal-message";
import { useDeletePersonalMessage } from "@/src/shared/api/game-master/use-delete-personal-message";
import { useShareMessage } from "@/src/shared/api/game-master/use-share-message";
import { getPersonalMessagesAction, type IPersonalMessage } from "@/src/shared/actions/game-master/get-personal-messages";
import type { ColumnsType } from "antd/es/table";

const DEFAULT_PAGE_SIZE = 30;

export const ChatPersonalView = ({ disabled }: { disabled?: boolean }) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<IPersonalMessage[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [typing, setTyping] = useState(false);

  const { data: sessionData } = usePersonalSession();
  const sessionId = sessionData?.id ?? undefined;

  const prevSessionId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    if (prevSessionId.current && prevSessionId.current !== sessionId) {
      setTyping(false);
    }
    prevSessionId.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionId) {
        queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sessionId, queryClient]);

  const { data: msgData } = usePersonalMessages(sessionId, page);
  const sendMutation = useSendPersonalMessage();
  const deleteMutation = useDeletePersonalMessage();
  const shareMutation = useShareMessage();

  const mapMsg = (m: IPersonalMessage): IMessage => ({
    id: m.id,
    sender: m.role === "master" ? t("chat.master") : (m.senderDisplayName || t("admin.roleAdmin")),
    role: m.role,
    text: m.content,
    summarized: m.summarized,
    avatarUrl: (m.role === "player" || m.role === "admin") ? (m.senderAvatar || undefined) : undefined,
  });

  const messages: IMessage[] = msgData && "messages" in msgData ? msgData.messages.map(mapMsg) : [];

  const handleSend = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (content: string, files: File[]) => {
      if (!sessionId || !content.trim()) return;
      await sendMutation.mutateAsync({ sessionId, content });
    },
    [sessionId, sendMutation]
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      const result = await deleteMutation.mutateAsync(messageId);
      if (!result.success) {
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
    },
    [deleteMutation, t, notification]
  );

  const handleShare = useCallback(
    async (messageId: string) => {
      const result = await shareMutation.mutateAsync(messageId);
      if (result.success) {
        antNotification.success({ message: t("chat.shareDone") });
      } else {
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
    },
    [shareMutation, t, notification]
  );

  const openHistory = async () => {
    if (!sessionId) return;
    setHistoryOpen(true);
    setHistoryPage(1);
    await loadHistory(1);
  };

  const loadHistory = async (p: number, ps?: number) => {
    if (!sessionId) return;
    const size = ps ?? historyPageSize;
    setHistoryLoading(true);
    setHistoryPage(p);
    setHistoryPageSize(size);
    const result = await getPersonalMessagesAction(sessionId, p, size);
    if ("messages" in result) {
      setHistoryData(result.messages);
      setHistoryTotal(result.total);
    }
    setHistoryLoading(false);
  };

  const historyColumns: ColumnsType<IPersonalMessage> = [
    { title: t("chat.role"), dataIndex: "role", width: 80,
      render: (role: string) => (role === "master" ? t("chat.master") : t("admin.roleAdmin")) },
    { title: t("chat.message"), dataIndex: "content",
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
        title={t("chatPersonal.title")}
        hideShare={false}
        disabled={disabled}
        disabledText={disabled ? t("chat.devModeDisabled") : undefined}
        onDelete={handleDelete}
        onShare={handleShare}
        onHistoryClick={openHistory}
        onSend={handleSend}
        sending={sendMutation.isPending}
        typing={typing}
        stepsSessionId={sessionId}
        stepsEndpoint="/api/game-chat/steps"
        onStepsStart={() => { setTyping(true); queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] }); }}
        onStepsDone={() => { setTyping(false); queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] }); }}
        onStepsError={(msg: string) => { notification.error({ title: msg }); setTyping(false); queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] }); }}
      />
      <Modal
        title={t("chat.historyTitle")}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        centered width={640}
      >
        <Table dataSource={historyData} columns={historyColumns} rowKey="id" size="small"
          loading={historyLoading}
          pagination={{ current: historyPage, total: historyTotal, pageSize: historyPageSize, showSizeChanger: { showSearch: false }, hideOnSinglePage: true, onChange: loadHistory }}
          showHeader={false}
          locale={{ emptyText: t("chat.noMessages") }} />
      </Modal>
    </>
  );
};
