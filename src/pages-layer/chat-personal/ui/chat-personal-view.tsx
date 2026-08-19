"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App, Button, Tooltip, notification as antNotification } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { ChatPanel, type IMessage } from "@/src/features/chat-panel";
import { RollStrip } from "@/src/features/roll-strip";
import { usePersonalSession } from "@/src/shared/api/game-master/use-personal-session";
import { usePersonalMessages } from "@/src/shared/api/game-master/use-personal-messages";
import { useSendPersonalMessage } from "@/src/shared/api/game-master/use-send-personal-message";
import { useDeletePersonalMessage } from "@/src/shared/api/game-master/use-delete-personal-message";
import { useClearPersonalChat } from "@/src/shared/api/game-master/useClearPersonalChat";
import { useShareMessage } from "@/src/shared/api/game-master/use-share-message";
import { usePersonalRolls, useExecuteRoll } from "@/src/shared/api/game-master/use-session-rolls";
import { stopGameMasterResponseAction } from "@/src/shared/actions/game-master/stop-master-response";
import { requestPersonalMasterResponseAction } from "@/src/shared/actions/game-master/request-personal-master-response";
import { getPersonalMessagesAction, type IPersonalMessage } from "@/src/shared/actions/game-master/get-personal-messages";
import { useChatHistory } from "@/src/shared/api/history/use-chat-history";
import type { ColumnsType } from "antd/es/table";

const DEFAULT_PAGE_SIZE = 30;

export const ChatPersonalView = ({ disabled, userId, isAdmin }: { disabled?: boolean; userId?: string; isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [typing, setTyping] = useState(false);
  const [stopping, setStopping] = useState(false);

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
  const clearMutation = useClearPersonalChat();
  const shareMutation = useShareMessage();
  const { data: rolls } = usePersonalRolls();
  const executeRollMutation = useExecuteRoll();

  const handleClearChat = useCallback(() => {
    if (sessionId) clearMutation.mutate(sessionId);
  }, [sessionId, clearMutation]);

  const stopMutation = useMutation({
    mutationFn: () => stopGameMasterResponseAction(sessionId!),
    onMutate: () => setStopping(true),
    onSettled: () => setStopping(false),
  });

  const requestMutation = useMutation({
    mutationFn: () => requestPersonalMasterResponseAction(sessionId!),
  });

  const handleRequestMaster = useCallback(async () => {
    if (!sessionId) return;
    await requestMutation.mutateAsync();
  }, [sessionId, requestMutation]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    await stopMutation.mutateAsync();
  }, [sessionId, stopMutation]);

  const handleToolStep = useCallback((tool: string) => {
    if (tool === "present_roll_check") queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
  }, [queryClient]);

  const handleStepsStart = useCallback(() => {
    setTyping(true);
    queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
  }, [queryClient, sessionId]);

  const handleStepsDone = useCallback(() => {
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
  }, [queryClient, sessionId]);

  const handleStepsError = useCallback((msg: string) => {
    notification.error({ title: msg });
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
  }, [notification, queryClient, sessionId]);

  const handleStepsResync = useCallback(() => {
    setTyping(false); setStopping(false);
    queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
  }, [queryClient, sessionId]);

  const messages: IMessage[] = useMemo(() => {
    const mapMsg = (m: IPersonalMessage): IMessage => ({
      id: m.id,
      sender: m.role === "master" ? t("chat.master") : (m.senderDisplayName || t("admin.roleAdmin")),
      role: m.role,
      text: m.content,
      summarized: m.summarized,
      avatarUrl: (m.role === "player" || m.role === "admin") ? (m.senderAvatar || undefined) : undefined,
    });
    const msgList: IPersonalMessage[] = msgData && "messages" in msgData ? msgData.messages : [];
    const msgs: IMessage[] = msgList.map(mapMsg);
    if (msgList.length === 0) return msgs;

    const msgTimes = msgList.map(m => new Date(m.createdAt).getTime());
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
        rollCheckName: r.checkName,
        rollResult: r.result ?? "",
        rollDetail: r.detail ?? "",
        rollExpression: r.diceExpression,
        rollTimestamp: new Date(r.completedAt!).getTime(),
      }));
    return [...msgs, ...rollEntries].sort((a, b) => {
      const aCreated = a.isRollEntry ? (a.rollTimestamp ?? 0) : new Date(msgList.find(m => m.id === a.id)?.createdAt ?? 0).getTime();
      const bCreated = b.isRollEntry ? (b.rollTimestamp ?? 0) : new Date(msgList.find(m => m.id === b.id)?.createdAt ?? 0).getTime();
      return aCreated - bCreated;
    });
  }, [msgData, rolls, t]);

  const handleSend = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (content: string, files: File[]) => {
      if (!sessionId || !content.trim()) return;
      const result = await sendMutation.mutateAsync({ sessionId, content });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["personal", "messages", sessionId] });
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

  const { data: historyData, isFetching: historyLoading } = useChatHistory<IPersonalMessage>(
    "personal",
    sessionId,
    historyPage,
    historyPageSize,
    historyOpen,
    getPersonalMessagesAction
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

  const requestBtn = (
    <Tooltip title={typing ? t("chat.masterThinking") : t("chat.requestMasterResponse")}>
      <Button
        type="default"
        size="small"
        icon={<RobotOutlined />}
        disabled={disabled || typing || stopping || requestMutation.isPending || !sessionId}
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
        title={t("chatPersonal.title")}
        hideShare={false}
        disabled={disabled}
        disabledText={disabled ? t("chat.devModeDisabled") : undefined}
        typingSender={t("chat.master")}
        onDelete={isAdmin ? handleDelete : undefined}
        onShare={handleShare}
        onHistoryClick={openHistory}
        onClearChat={isAdmin ? handleClearChat : undefined}
        onSend={handleSend}
        onStop={handleStop}
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
        rollStrip={<RollStrip rolls={(rolls ?? []).filter(r => r.status !== "completed")} currentUserId={userId} onExecuteRoll={(id) => executeRollMutation.mutate(id, { onError: (e) => notification.error({ title: t(e instanceof Error ? e.message : "errors.unknownError") }) })} executing={executeRollMutation.isPending} disabled={typing} />}
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
