"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App, Segmented, Tooltip, Button } from "antd";
import { SettingOutlined, DatabaseOutlined, PaperClipOutlined, RobotOutlined } from "@ant-design/icons";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { ChatPanel, type IMessage } from "@/src/features/chat-panel";
import { useBuilderSession } from "@/src/shared/api/builder/useBuilderSession";
import { useBuilderMessages } from "@/src/shared/api/builder/useBuilderMessages";
import { useSendBuilderMessage } from "@/src/shared/api/builder/useSendMessage";
import { useDeleteBuilderMessage } from "@/src/shared/api/builder/useDeleteMessage";
import { useClearBuilderChat } from "@/src/shared/api/builder/useClearChat";
import { useBuilderMode } from "@/src/shared/api/builder/use-builder-mode";
import type { TBuilderMode } from "@/src/shared/actions/builder/set-builder-mode";
import { getBuilderMessagesAction, type IBuilderMessage } from "@/src/shared/actions/builder/get-messages";
import { stopBuilderAction } from "@/src/shared/actions/builder/stop-builder";
import { requestBuilderResponseAction } from "@/src/shared/actions/builder/request-builder-response";
import { checkProcessingAction } from "@/src/shared/actions/builder/check-processing";
import { useAgentTranscript } from "@/src/shared/api/agents/use-agent-transcript";
import type { ITranscriptRow } from "@/src/shared/actions/agents/get-agent-transcript";
import { useChatHistory } from "@/src/shared/api/history/use-chat-history";
import type { ColumnsType } from "antd/es/table";
import styles from "@/src/features/chat-panel/ui/chat-panel.module.css";

const DEFAULT_PAGE_SIZE = 30;

async function uploadFile(file: File): Promise<{ fileId: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/builder/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }
  const data = await res.json();
  return { fileId: data.fileId, filename: data.filename };
}

export const BuilderChatView = () => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [page, setPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE);

  // UI state — driven by SSE, not by mutation
  const [typing, setTyping] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stoppingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: sessionData } = useBuilderSession();
  const prevSessionId = useRef<string | undefined>(undefined);

  const sessionId = sessionData?.id;
  const { mode, setMode } = useBuilderMode(sessionId ?? null);
  const { modal } = App.useApp();

  const [switchingMode, setSwitchingMode] = useState(false);
  const lastMemorySwitch = useRef<number>(0);

  // --- Mode switching ---
  const handleModeChange = useCallback(async (newMode: TBuilderMode) => {
    if (newMode === mode || switchingMode) return;
    setSwitchingMode(true);

    const descriptions: Record<TBuilderMode, { title: string; content: string }> = {
      brain: {
        title: t("builder.modeBrainTitle"),
        content: t("builder.modeBrainDesc"),
      },
      memory: {
        title: t("builder.modeMemoryTitle"),
        content: t("builder.modeMemoryDesc"),
      },
    };

    let extra = "";
    if (newMode === "memory") {
      const elapsed = Date.now() - lastMemorySwitch.current;
      if (lastMemorySwitch.current > 0 && elapsed > 30 * 60 * 1000) {
        extra = "\n\n" + t("builder.modeMemoryLongTime");
      }
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: descriptions[newMode].title,
        content: descriptions[newMode].content + extra,
        okText: t("common.switch"),
        cancelText: t("common.cancel"),
        mask: { closable: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    if (confirmed) {
      await setMode(newMode);
      if (newMode === "memory") lastMemorySwitch.current = Date.now();
    }
    setSwitchingMode(false);
  }, [mode, switchingMode, setMode, modal, t]);

  // On mount or sessionId change: check if processing is already active, reset UI on switch
  useEffect(() => {
    if (!sessionId) return;
    if (prevSessionId.current && prevSessionId.current !== sessionId) {
      // Session changed (game switched) — reset all builder UI state
      setTyping(false);
      setStopping(false);
    }
    prevSessionId.current = sessionId;

    void checkProcessingAction(sessionId).then((r) => {
      if (r.processing) setTyping(true);
    });
  }, [sessionId]);

  // Sync messages when tab becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionId) {
        queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sessionId, queryClient]);

  const { data: msgData } = useBuilderMessages(sessionId, page);
  const { data: transcriptData } = useAgentTranscript(sessionId ?? undefined);
  const sendMutation = useSendBuilderMessage();
  const deleteMutation = useDeleteBuilderMessage();
  const clearMutation = useClearBuilderChat();

  const rawMessages = useMemo(() => msgData && "messages" in msgData ? msgData.messages : [], [msgData]);

  const debugRows = useMemo(() => {
    if (!transcriptData || !("rows" in transcriptData)) return undefined;
    const map: Record<string, ITranscriptRow[]> = {};
    for (const r of transcriptData.rows) {
      if (!r.runId) continue;
      (map[r.runId] ??= []).push(r);
    }
    return map;
  }, [transcriptData]);

  const messages: IMessage[] = useMemo(() => {
    if (rawMessages.length === 0) return [];
    const mapMsg = (m: IBuilderMessage): IMessage => ({
      id: m.id,
      sender: m.role === "builder" ? t("chat.builderLabel") : (m.senderDisplayName || t("admin.roleAdmin")),
      role: m.role,
      text: m.content,
      summarized: m.summarized,
      runId: m.runId ?? undefined,
      avatarUrl: (m.role === "admin") ? (m.senderAvatar || undefined) : undefined,
      attachedFiles: m.attachedFiles?.length ? m.attachedFiles : undefined,
      prefix: m.attachedFiles?.length ? (
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
          <PaperClipOutlined style={{ fontSize: 10, marginRight: 4 }} />
          {m.attachedFiles.map((f) => truncateName(f.filename)).join(", ")}
        </div>
      ) : undefined,
    });
    return rawMessages
      .map(mapMsg)
      .sort((a, b) => {
        const aTs = new Date(rawMessages.find(m => m.id === a.id)?.createdAt ?? 0).getTime();
        const bTs = new Date(rawMessages.find(m => m.id === b.id)?.createdAt ?? 0).getTime();
        return aTs - bTs;
      });
  }, [rawMessages, t]);

  // --- Send: upload files → save message → let SSE drive the rest ---
  const handleSend = useCallback(
    async (content: string, files: File[]) => {
      if (!sessionId) return;

      // Upload files first
      let fileIds: string[] = [];
      let fileNames: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          const results = await Promise.all(files.map(uploadFile));
          fileIds = results.map((r) => r.fileId);
          fileNames = results.map((r) => r.filename);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : t("errors.uploadFailed");
          notification.error({ title: msg });
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      // Save message (fire-and-forget, AI runs in background)
      const result = await sendMutation.mutateAsync({ sessionId, content, fileIds, fileNames });
      if (!result.success) {
        queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] });
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
      // Don't set typing — SSE does it when processing starts
    },
    [sessionId, sendMutation, queryClient, notification, t]
  );

  // --- Stop ---
  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    setStopping(true);
    if (stoppingTimeoutRef.current) clearTimeout(stoppingTimeoutRef.current);
    stoppingTimeoutRef.current = setTimeout(() => setStopping(false), 10_000);
    await stopBuilderAction(sessionId);
  }, [sessionId]);

  // --- Request response ---
  const requestMutation = useMutation({
    mutationFn: () => requestBuilderResponseAction(sessionId!),
  });

  const handleRequestResponse = useCallback(async () => {
    if (!sessionId) return;
    await requestMutation.mutateAsync();
  }, [sessionId, requestMutation]);

  // --- Delete ---
  const handleDelete = useCallback(
    async (messageId: string) => {
      const result = await deleteMutation.mutateAsync(messageId);
      if (!result.success) {
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
    },
    [deleteMutation, t, notification]
  );

  // --- Clear ---
  const handleClear = useCallback(() => {
    if (sessionId) clearMutation.mutate(sessionId);
  }, [sessionId, clearMutation]);

  // --- History ---
  const { data: historyData, isFetching: historyLoading } = useChatHistory<IBuilderMessage>(
    "builder",
    sessionId,
    historyPage,
    historyPageSize,
    historyOpen,
    getBuilderMessagesAction
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

  const historyColumns: ColumnsType<IBuilderMessage> = [
    { title: t("chat.role"), dataIndex: "role", width: 80,
      render: (role: string) => (role === "builder" ? t("chat.builderLabel") : t("admin.roleAdmin")) },
    { title: t("chat.message"), dataIndex: "content",
      render: (text: string, record: IBuilderMessage) => (
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 500 }}>
          {record.attachedFiles?.length ? (
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
              <PaperClipOutlined style={{ fontSize: 10, marginRight: 4 }} />
              {record.attachedFiles.map((f) => truncateName(f.filename)).join(", ")}
            </div>
          ) : null}
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
        disabled={typing || stopping || uploading || requestMutation.isPending || !sessionId}
        loading={requestMutation.isPending}
        onClick={handleRequestResponse}
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
        title={t("mode.builderChat")}
        hideShare
        allowFiles
        acceptFiles=".md,.zip"
        inputPrefix={
          <Segmented
            size="small"
            className={styles.modeSwitcher}
            value={mode}
            disabled={typing || stopping}
            onChange={(v) => handleModeChange(v as TBuilderMode)}
            options={[
              { label: <Tooltip title={t("builder.modeBrainHint")}><SettingOutlined /> {t("builder.modeBrain")}</Tooltip>, value: "brain" },
              { label: <Tooltip title={t("builder.modeMemoryHint")}><DatabaseOutlined /> {t("builder.modeMemory")}</Tooltip>, value: "memory" },
            ]}
          />
        }
        onDelete={handleDelete}
        onHistoryClick={openHistory}
        onClearChat={handleClear}
        onSend={handleSend}
        onStop={handleStop}
        sending={sendMutation.isPending || uploading}
        typing={typing}
        stopping={stopping}
        footerAction={requestBtn}
        stepsSessionId={sessionId ?? undefined}
        debugRows={debugRows}
        onStepsStart={() => { setTyping(true); setStopping(false); if (stoppingTimeoutRef.current) { clearTimeout(stoppingTimeoutRef.current); stoppingTimeoutRef.current = null; } queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] }); }}
        onStepsDone={() => { setTyping(false); setStopping(false); if (stoppingTimeoutRef.current) { clearTimeout(stoppingTimeoutRef.current); stoppingTimeoutRef.current = null; } queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] }); }}
        onStepsError={(msg: string) => { notification.error({ title: msg }); setTyping(false); setStopping(false); if (stoppingTimeoutRef.current) { clearTimeout(stoppingTimeoutRef.current); stoppingTimeoutRef.current = null; } queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] }); }}
        onStepsResync={() => { setTyping(false); setStopping(false); queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); queryClient.invalidateQueries({ queryKey: ["agent", "transcript", sessionId] }); }}
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

function truncateName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name.length > 24 ? name.slice(0, 22) + "\u2026" : name;
  const ext = name.slice(dot);
  const base = name.slice(0, dot);
  if (name.length <= 28) return name;
  return base.slice(0, 20) + "\u2026" + ext;
}
