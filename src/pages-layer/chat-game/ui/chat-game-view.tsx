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
import { useSessionRolls, useExecuteRoll } from "@/src/shared/api/game-master/use-session-rolls";
import { requestMasterResponseAction } from "@/src/shared/actions/game-master/request-master-response";
import { stopGameMasterResponseAction } from "@/src/shared/actions/game-master/stop-master-response";
import { getGameMessagesAction, type IGameMessage } from "@/src/shared/actions/game-master/get-game-messages";
import type { ColumnsType } from "antd/es/table";

const DEFAULT_PAGE_SIZE = 30;

export const ChatGameView = ({ disabled, userId }: { disabled?: boolean; userId?: string }) => {
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
    if (!typing) return;
    const t = setTimeout(() => { setTyping(false); setStopping(false); }, 25_000);
    return () => clearTimeout(t);
  }, [typing]);

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
  const { data: rolls } = useSessionRolls(sessionId);
  const executeRollMutation = useExecuteRoll();

  const requestMutation = useMutation({
    mutationFn: () => requestMasterResponseAction(sessionId!),
    onError: (err: Error) => notification.error({ title: err.message }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopGameMasterResponseAction(sessionId!),
    onMutate: () => setStopping(true),
    onSettled: () => setStopping(false),
  });

  const mapMsg = (m: IGameMessage): IMessage => ({
    id: m.id,
    sender: m.role === "master" ? t("chat.master") : (m.senderDisplayName || t("admin.roleAdmin")),
    role: m.role,
    text: m.content,
    shared: m.shared,
    summarized: m.summarized,
    avatarUrl: (m.role === "player" || m.role === "admin") ? (m.senderAvatar || undefined) : undefined,
  });

  const rawMessages = useMemo(() => msgData && "messages" in msgData ? msgData.messages : [], [msgData]);

  const messages: IMessage[] = rawMessages.map(mapMsg);

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

  const handleRequestMaster = useCallback(async () => {
    if (!sessionId) return;
    await requestMutation.mutateAsync();
  }, [sessionId, requestMutation]);

  const handleStopMaster = useCallback(async () => {
    if (!sessionId) return;
    await stopMutation.mutateAsync();
  }, [sessionId, stopMutation]);

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
        hideShare={false}
        disabled={disabled || typing}
        disabledText={typing ? t("chat.masterThinking") : undefined}
        onDelete={handleDelete}
        onHistoryClick={openHistory}
        onSend={handleSend}
        onStop={handleStopMaster}
        sending={sendMutation.isPending}
        typing={typing}
        stopping={stopping}
        pendingCount={0}
        stepsSessionId={sessionId}
        stepsEndpoint="/api/game-chat/steps"
        onToolStep={(tool) => { if (tool === "present_roll_check") queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] });  } }
        onStepsStart={() => { setTyping(true); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); }}
        onStepsDone={() => { setTyping(false); setStopping(false); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] }); }}
        onStepsError={(msg: string) => { notification.error({ title: msg }); setTyping(false); setStopping(false); queryClient.invalidateQueries({ queryKey: ["game", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["game", "rolls", sessionId] }); }}
        footerAction={requestBtn}
        rollStrip={<RollStrip rolls={(rolls ?? []).filter(r => r.status !== "completed")} currentUserId={userId} onExecuteRoll={(id) => executeRollMutation.mutate(id)} executing={executeRollMutation.isPending} />}
        completedRolls={(rolls ?? []).filter(r => r.status === "completed").map(r => ({
          id: r.id, checkName: r.checkName, total: r.resultTotal ?? 0,
          detail: r.resultDetail ?? "", isMaster: !r.playerId,
        }))}
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
