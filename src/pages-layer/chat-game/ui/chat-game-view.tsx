"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel, type IMessage } from "@/src/features/chat-panel";
import { useGameSession } from "@/src/shared/api/game-master/use-game-session";
import { useGameMessages } from "@/src/shared/api/game-master/use-game-messages";
import { useSendGameMessage } from "@/src/shared/api/game-master/use-send-game-message";
import { useDeleteGameMessage } from "@/src/shared/api/game-master/use-delete-game-message";
import { getGameMessagesAction, type IGameMessage } from "@/src/shared/actions/game-master/get-game-messages";
import type { ColumnsType } from "antd/es/table";

const DEFAULT_PAGE_SIZE = 30;

export const ChatGameView = ({ disabled }: { disabled?: boolean }) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<IGameMessage[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [typing, setTyping] = useState(false);

  const { data: sessionData } = useGameSession();
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
        queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sessionId, queryClient]);

  const { data: msgData } = useGameMessages(sessionId, page);
  const sendMutation = useSendGameMessage();
  const deleteMutation = useDeleteGameMessage();

  const mapMsg = (m: IGameMessage): IMessage => ({
    id: m.id,
    sender: m.role === "master" ? t("chat.master") : t("admin.roleAdmin"),
    role: m.role,
    text: m.content,
    shared: m.shared,
    summarized: m.summarized,
  });

  const rawMessages = useMemo(() => msgData && "messages" in msgData ? msgData.messages : [], [msgData]);

  const messages: IMessage[] = rawMessages.map(mapMsg);

  const pendingCount = useMemo(() => {
    if (!typing) return 0;
    let lastMasterIdx = -1;
    for (let i = rawMessages.length - 1; i >= 0; i--) {
      if (rawMessages[i].role === "master") { lastMasterIdx = i; break; }
    }
    return rawMessages.filter((m, i) => i > lastMasterIdx && (m.role === "player" || m.role === "admin")).length;
  }, [rawMessages, typing]);

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
    const result = await getGameMessagesAction(sessionId, p, size);
    if ("messages" in result) {
      setHistoryData(result.messages);
      setHistoryTotal(result.total);
    }
    setHistoryLoading(false);
  };

  const historyColumns: ColumnsType<IGameMessage> = [
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
        title={t("chat.gameChat")}
        hideShare={false}
        disabled={disabled}
        disabledText={disabled ? t("chat.devModeDisabled") : undefined}
        onDelete={handleDelete}
        onHistoryClick={openHistory}
        onSend={handleSend}
        sending={sendMutation.isPending}
        typing={typing}
        pendingCount={pendingCount}
        stepsSessionId={sessionId}
        stepsEndpoint="/api/game-chat/steps"
        onStepsStart={() => { setTyping(true); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); }}
        onStepsDone={() => { setTyping(false); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); }}
        onStepsError={(msg: string) => { notification.error({ title: msg }); setTyping(false); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); }}
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
