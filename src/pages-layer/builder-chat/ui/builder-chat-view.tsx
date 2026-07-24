"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Table, App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel } from "@/src/features/chat-panel";
import { FileOutlined } from "@ant-design/icons";
import { useBuilderSession } from "@/src/shared/api/builder/use-builder-session";
import { useBuilderMessages } from "@/src/shared/api/builder/use-builder-messages";
import { useSendBuilderMessage } from "@/src/shared/api/builder/use-send-message";
import { useDeleteBuilderMessage } from "@/src/shared/api/builder/use-delete-message";
import { useClearBuilderChat } from "@/src/shared/api/builder/use-clear-chat";
import { getBuilderMessagesAction, type IBuilderMessage } from "@/src/shared/actions/builder/get-messages";
import { stopBuilderAction } from "@/src/shared/actions/builder/stop-builder";
import type { IMessage } from "@/src/features/chat-panel";
import type { ColumnsType } from "antd/es/table";

const PAGE_SIZE = 30;

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/builder/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }
  const data = await res.json();
  return data.fileId as string;
}

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

  // UI state — driven by SSE, not by mutation
  const [typing, setTyping] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: sessionData } = useBuilderSession();
  const sessionId = sessionData?.id;

  // On mount: check if processing is already active (e.g. after page reload)
  useEffect(() => {
    if (!sessionId) return;
    import("@/src/shared/actions/builder/check-processing").then(({ checkProcessingAction }) => {
      checkProcessingAction(sessionId).then((r) => {
        if (r.processing) setTyping(true);
      });
    });
  }, [sessionId]);

  // Sync messages when tab becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionId) {
        queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sessionId, queryClient]);

  // Reset stopping when typing ends
  useEffect(() => {
    if (!typing) setStopping(false);
  }, [typing]);

  const { data: msgData } = useBuilderMessages(sessionId, page);
  const sendMutation = useSendBuilderMessage();
  const deleteMutation = useDeleteBuilderMessage();
  const clearMutation = useClearBuilderChat();

  const mapMsg = (m: IBuilderMessage): IMessage => ({
    id: m.id,
    sender: m.role === "builder" ? t("chat.builderLabel") : t("admin.roleAdmin"),
    role: m.role,
    text: m.content,
    summarized: m.summarized,
    prefix: m.hasFiles
      ? <span style={{ fontSize: 11, opacity: 0.5 }}><FileOutlined /></span>
      : undefined,
  });

  const messages: IMessage[] = msgData && "messages" in msgData ? msgData.messages.map(mapMsg) : [];

  // --- Send: upload files → save message → let SSE drive the rest ---
  const handleSend = useCallback(
    async (content: string, files: File[]) => {
      if (!sessionId) return;

      // Upload files first
      let fileIds: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          fileIds = await Promise.all(files.map(uploadFile));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          notification.error({ title: msg });
          setUploading(false);
          return; // keep input + files, let user retry
        }
        setUploading(false);
      }

      // Save message (fire-and-forget, AI runs in background)
      await sendMutation.mutateAsync({ sessionId, content, fileIds });
      // Don't set typing — SSE does it when processing starts
    },
    [sessionId, sendMutation]
  );

  // --- Stop ---
  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    setStopping(true);
    await stopBuilderAction(sessionId);
  }, [sessionId]);

  // --- Delete ---
  const handleDelete = useCallback(
    async (messageId: string) => {
      const result = await deleteMutation.mutateAsync(messageId);
      if (!result.success) {
        notification.error({ title: t(result.error || "errors.unknownError") });
      }
    },
    [deleteMutation]
  );

  // --- Clear ---
  const handleClear = useCallback(() => {
    if (sessionId) clearMutation.mutate(sessionId);
  }, [sessionId, clearMutation]);

  // --- History ---
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
    const result = await getBuilderMessagesAction(sessionId, p, PAGE_SIZE);
    if ("messages" in result) {
      setHistoryData(result.messages);
      setHistoryTotal(result.total);
    }
    setHistoryLoading(false);
  };

  const historyColumns: ColumnsType<IBuilderMessage> = [
    { title: t("chat.role"), dataIndex: "role", width: 80,
      render: (role: string) => (role === "builder" ? t("chat.builderLabel") : t("admin.roleAdmin")) },
    { title: t("chat.message"), dataIndex: "content",
      render: (text: string) => <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 500 }}>{text}</div> },
  ];

  return (
    <>
      <ChatPanel
        messages={messages}
        placeholder={t("chat.placeholder")}
        title={t("mode.builderChat")}
        hideShare
        allowFiles
        acceptFiles=".pdf,.txt,.md,.docx"
        onDelete={handleDelete}
        onHistoryClick={openHistory}
        onClearChat={handleClear}
        onSend={handleSend}
        onStop={handleStop}
        sending={sendMutation.isPending || uploading}
        typing={typing}
        stopping={stopping}
        stepsSessionId={sessionId ?? undefined}
        onStepsStart={() => { setTyping(true); setStopping(false); }}
        onStepsDone={() => { setTyping(false); setStopping(false); queryClient.invalidateQueries({ queryKey: ["builder", "messages", sessionId] }); }}
        onStepsError={(msg: string) => { notification.error({ title: msg }); setTyping(false); setStopping(false); }}
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
          pagination={{ current: historyPage, total: historyTotal, pageSize: PAGE_SIZE, showSizeChanger: false, onChange: loadHistory }}
          showHeader={false}
          locale={{ emptyText: t("chat.noMessages") }} />
      </Modal>
    </>
  );
};
