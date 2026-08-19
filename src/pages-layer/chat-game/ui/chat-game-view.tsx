"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App, Button, Tooltip } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { ChatPanel, type IMessage } from "@/src/features/chat-panel";
import { RollStrip } from "@/src/features/roll-strip";
import { useGameSession } from "@/src/shared/api/game-master/use-game-session";
import { useGameMessages } from "@/src/shared/api/game-master/use-game-messages";
import { useSendGameMessage } from "@/src/shared/api/game-master/use-send-game-message";
import { useDeleteGameMessage } from "@/src/shared/api/game-master/use-delete-game-message";
import { useClearGameChat } from "@/src/shared/api/game-master/useClearGameChat";
import { useSessionRolls, useExecuteRoll } from "@/src/shared/api/game-master/use-session-rolls";
import { requestMasterResponseAction } from "@/src/shared/actions/game-master/request-master-response";
import { stopGameMasterResponseAction } from "@/src/shared/actions/game-master/stop-master-response";
import { getGameMessagesAction, type IGameMessage } from "@/src/shared/actions/game-master/get-game-messages";
import { useChatHistory } from "@/src/shared/api/history/use-chat-history";
import type { ColumnsType } from "antd/es/table";

const DEFAULT_PAGE_SIZE = 30;

export const ChatGameView = ({ disabled, userId, isAdmin }: { disabled?: boolean; userId?: string; isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [typing, setTyping] = useState(false);
  const [stopping, setStopping] = useState(false);

  const { data: sessionData } = useGameSession();
  const sessionId = sessionData?.id ?? undefined;

  const prevSessionId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    if (prevSessionId.current && prevSessionId.current !== sessionId) {
      setTyping(false);
      setStopping(false);
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
  const clearMutation = useClearGameChat();
  const { data: rolls } = useSessionRolls(sessionId);
  const executeRollMutation = useExecuteRoll();

  const handleClearChat = useCallback(() => {
    if (sessionId) clearMutation.mutate(sessionId);
  }, [sessionId, clearMutation]);

  const requestMutation = useMutation({
    mutationFn: () => requestMasterResponseAction(sessionId!),
    onError: (err: Error) => notification.error({ title: err.message }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopGameMasterResponseAction(sessionId!),
    onMutate: () => setStopping(true),
    onSettled: () => setStopping(false),
  });

  const handleToolStep = useCallback((tool: string) => {
    if (tool === "present_roll_check") queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] });
  }, [queryClient, sessionId]);

  const handleStepsStart = useCallback(() => {
    setTyping(true);
    queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
  }, [queryClient, sessionId]);

  const handleStepsDone = useCallback(() => {
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] });
  }, [queryClient, sessionId]);

  const handleStepsError = useCallback((msg: string) => {
    notification.error({ title: msg });
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] });
  }, [notification, queryClient, sessionId]);

  const handleStepsResync = useCallback(() => {
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] });
  }, [queryClient, sessionId]);

  const rawMessages = useMemo(() => msgData && "messages" in msgData ? msgData.messages : [], [msgData]);

  const messages: IMessage[] = useMemo(() => {
    const mapMsg = (m: IGameMessage): IMessage => ({
      id: m.id,
      sender: m.role === "master" ? t("chat.master") : (m.senderDisplayName || t("admin.roleAdmin")),
      role: m.role,
      text: m.content,
      shared: m.shared,
      summarized: m.summarized,
      avatarUrl: (m.role === "player" || m.role === "admin") ? (m.senderAvatar || undefined) : undefined,
    });
    const msgs = rawMessages.map(mapMsg);
    if (rawMessages.length === 0) return msgs;

    const msgTimes = rawMessages.map(m => new Date(m.createdAt).getTime());
    const minTs = Math.min(...msgTimes);

    const rollEntries: IMessage[] = (rolls ?? [])
      .filter(r => r.status === "completed" && r.completedAt)
      .filter(r => new Date(r.completedAt!).getTime() >= minTs)
      .map(r => ({
        id: `roll-${r.id}`,
        sender: "",
        role: "roll",
        text: "",
        isRollEntry: true,
        // Player rolls show their signature ("Имя: Проверка"), master rolls
        // show only "Мастер" — the check name and dice detail stay hidden.
        rollCheckName: r.playerName ? `${r.playerName}: ${r.checkName}` : t("chat.master"),
        rollResult: r.result ?? "",
        rollDetail: r.playerName ? (r.detail ?? "") : "",
        rollExpression: r.diceExpression,
        rollTimestamp: new Date(r.completedAt!).getTime(),
      }));
    return [...msgs, ...rollEntries].sort((a, b) => {
      const aCreated = a.isRollEntry ? (a.rollTimestamp ?? 0) : new Date(rawMessages.find(m => m.id === a.id)?.createdAt ?? 0).getTime();
      const bCreated = b.isRollEntry ? (b.rollTimestamp ?? 0) : new Date(rawMessages.find(m => m.id === b.id)?.createdAt ?? 0).getTime();
      return aCreated - bCreated;
    });
  }, [rawMessages, rolls, t]);

  const handleSend = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (content: string, files: File[]) => {
      if (!sessionId || !content.trim()) return;
      const result = await sendMutation.mutateAsync({ sessionId, content });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] });
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
    },
    [sessionId, sendMutation, queryClient, notification, t]
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

  const handleRequestMaster = useCallback(async () => {
    if (!sessionId) return;
    await requestMutation.mutateAsync();
  }, [sessionId, requestMutation]);

  const handleStopMaster = useCallback(async () => {
    if (!sessionId) return;
    await stopMutation.mutateAsync();
  }, [sessionId, stopMutation]);

  const { data: historyData, isFetching: historyLoading } = useChatHistory<IGameMessage>(
    "game",
    sessionId,
    historyPage,
    historyPageSize,
    historyOpen,
    getGameMessagesAction
  );
  const historyMessages = historyData && "messages" in historyData ? historyData.messages : [];
  const historyTotal = historyData && "messages" in historyData ? historyData.total : 0;

  const openHistory = () => {
    if (!sessionId) return;
    setHistoryOpen(true);
    setHistoryPage(1);
  };

  const handleHistoryChange = (p: number, ps: number) => {
    setHistoryPage(p);
    setHistoryPageSize(ps);
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

  const requestBtn = (
    <Tooltip title={typing ? t("chat.masterThinking") : t("chat.requestMasterResponse")}>
      <Button
        type="default"
        size="small"
        icon={<RobotOutlined />}
        disabled={typing || stopping || requestMutation.isPending || !sessionId}
        loading={requestMutation.isPending}
        onClick={handleRequestMaster}
      >
        {typing ? t("chat.masterThinking") : t("chat.requestMasterResponse")}
      </Button>
    </Tooltip>
  );

  return (
    <>
      <ChatPanel
        messages={messages}
        placeholder={t("chat.placeholder")}
        title={t("chat.gameChat")}
        hideShare
        disabled={disabled || typing}
        disabledText={disabled ? t("chat.devModeDisabled") : undefined}
        typingSender={t("chat.master")}
        onDelete={isAdmin ? handleDelete : undefined}
        onHistoryClick={openHistory}
        onClearChat={isAdmin ? handleClearChat : undefined}
        onSend={handleSend}
        onStop={handleStopMaster}
        sending={sendMutation.isPending}
        typing={typing}
        stopping={stopping}
        stepsSessionId={sessionId}
        onToolStep={handleToolStep}
        onStepsStart={handleStepsStart}
        onStepsDone={handleStepsDone}
        onStepsError={handleStepsError}
        onStepsResync={handleStepsResync}
        footerAction={requestBtn}
        rollStrip={<RollStrip rolls={(rolls ?? []).filter(r => r.status !== "completed")} currentUserId={userId} onExecuteRoll={(id) => executeRollMutation.mutate(id)} executing={executeRollMutation.isPending} />}
      />
      <Modal
        title={t("chat.historyTitle")}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        centered width={640}
      >
        <Table dataSource={historyMessages} columns={historyColumns} rowKey="id" size="small"
          loading={historyLoading}
          pagination={{ current: historyPage, total: historyTotal, pageSize: historyPageSize, showSizeChanger: { showSearch: false }, hideOnSinglePage: true, onChange: handleHistoryChange }}
          showHeader={false}
          locale={{ emptyText: t("chat.noMessages") }} />
      </Modal>
    </>
  );
};
