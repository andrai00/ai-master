"use client";

import { Input, Button, Avatar, Tooltip, App, Popconfirm, Tag } from "antd";
import {
  SendOutlined,
  UserOutlined,
  RobotOutlined,
  ShareAltOutlined,
  CopyOutlined,
  DownOutlined,
  RightOutlined,
  DeleteOutlined,
  HistoryOutlined,
  CodeOutlined,
  ClearOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  FileAddOutlined,
  EditOutlined,
  ReadOutlined,
  SearchOutlined,
  CommentOutlined,
  PaperClipOutlined,
  CloseOutlined,
  FileOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useRef, useEffect, useState, useCallback, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import styles from "./chat-panel.module.css";

export interface IMessage {
  id: string;
  sender: string;
  role: string;
  text: ReactNode;
  avatarUrl?: string;
  shared?: boolean;
  summarized?: boolean;
  /** Optional prefix rendered before the markdown text (e.g. file attachment icon) */
  prefix?: ReactNode;
}

interface IChatPanelProps {
  messages: IMessage[];
  placeholder?: string;
  disabled?: boolean;
  disabledText?: string;
  hideShare?: boolean;
  title?: string;
  onDelete?: (id: string) => void;
  onHistoryClick?: () => void;
  onClearChat?: () => void;
  onSend?: (text: string, files: File[]) => void;
  onStop?: () => void;
  sending?: boolean;
  typing?: boolean;
  /** Show file attachment UI */
  allowFiles?: boolean;
  /** File input accept attribute, e.g. ".pdf,.txt,.md,.docx" */
  acceptFiles?: string;
  /** Max files per message (default 5) */
  maxFiles?: number;
  /** Max single file size in bytes (default 50MB) */
  maxFileSize?: number;
  /** Session ID for real-time step tracking via SSE (builder chat) */
  stepsSessionId?: string;
  /** Called when first step event arrives (processing started) */
  onStepsStart?: () => void;
  /** Called when SSE reports processing is done */
  onStepsDone?: () => void;
  /** Called when SSE reports an error */
  onStepsError?: (message: string) => void;
  /** True while stop is in progress (waiting for abort to complete) */
  stopping?: boolean;
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB per file

function groupMessages(messages: IMessage[]) {
  const result: { event?: { ids: string[]; sender: string }; messages: IMessage[] }[] = [];
  let sharedGroup: IMessage[] = [];

  for (const msg of messages) {
    if (msg.shared) {
      const groupInitiator = sharedGroup.length > 0 ? sharedGroup[0].sender : null;
      if (groupInitiator && msg.role === "player" && msg.sender !== groupInitiator) {
        result.push({
          event: { ids: sharedGroup.map((m) => m.id), sender: sharedGroup[0].sender },
          messages: [...sharedGroup],
        });
        sharedGroup = [msg];
      } else {
        sharedGroup.push(msg);
      }
    } else {
      if (sharedGroup.length > 0) {
        result.push({
          event: { ids: sharedGroup.map((m) => m.id), sender: sharedGroup[0].sender },
          messages: [...sharedGroup],
        });
        sharedGroup = [];
      }
      result.push({ messages: [msg] });
    }
  }

  if (sharedGroup.length > 0) {
    result.push({
      event: { ids: sharedGroup.map((m) => m.id), sender: sharedGroup[0].sender },
      messages: [...sharedGroup],
    });
  }

  return result;
}

function getStepIcon(tool: string): ReactNode {
  const iconStyle = { fontSize: 12, marginRight: 2, opacity: 0.6 };
  switch (tool) {
    case "read_parsed_file":
      return <FileTextOutlined style={iconStyle} />;
    case "list_uploaded_files":
      return <UnorderedListOutlined style={iconStyle} />;
    case "create_document":
      return <FileAddOutlined style={iconStyle} />;
    case "update_document":
      return <EditOutlined style={iconStyle} />;
    case "read_document":
      return <ReadOutlined style={iconStyle} />;
    case "search_documents":
      return <SearchOutlined style={iconStyle} />;
    case "final":
      return <CommentOutlined style={iconStyle} />;
    default:
      return null;
  }
}

function getStepLabel(tool: string, t: (key: string) => string, exclude?: string): string {
  const key = `builder.steps.${tool}`;
  const raw = t(key);
  // If it's an array of phrases, pick one randomly (excluding last used)
  if (Array.isArray(raw)) {
    const pool = raw as string[];
    const available = exclude ? pool.filter((p) => p !== exclude) : pool;
    return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : pool[0];
  }
  return raw;
}

export const ChatPanel = ({
  messages, placeholder, disabled, disabledText, hideShare, title,
  onDelete, onHistoryClick, onClearChat, onSend, onStop,
  sending, typing,
  allowFiles, acceptFiles, maxFiles = DEFAULT_MAX_FILES, maxFileSize = DEFAULT_MAX_SIZE,
  stepsSessionId, stopping, onStepsDone, onStepsStart, onStepsError,
}: IChatPanelProps) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [liveStep, setLiveStep] = useState<{ tool: string; detail?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLabelRef = useRef<Map<string, string>>(new Map());

  // Subscribe to SSE for real-time step tracking (always connected on builder page)
  useEffect(() => {
    if (!stepsSessionId) {
      setLiveStep(null);
      return;
    }

    setLiveStep(null);
    let started = false;
    const es = new EventSource(`/api/builder/steps?sessionId=${stepsSessionId}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case "started":
            started = true;
            onStepsStart?.();
            break;
          case "step":
            if (!started) { started = true; onStepsStart?.(); }
            setLiveStep({ tool: data.tool, detail: data.detail });
            break;
          case "stopping":
            setLiveStep(null);
            break;
          case "done":
            onStepsDone?.();
            break;
          case "stopped":
            onStepsDone?.();
            break;
          case "error":
            onStepsError?.(data.message ?? "Unknown error");
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [stepsSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      notification.success({ title: t("chat.copied") });
    });
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if ((!text && attachedFiles.length === 0) || !onSend) return;
    onSend(text, attachedFiles);
    setInputValue("");
    setAttachedFiles([]);
  };

  // ---- file helpers ----

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const current = attachedFiles.length;
    const available = maxFiles - current;
    if (available <= 0) return;

    const toAdd = Array.from(newFiles).slice(0, available);
    const valid: File[] = [];

    for (const f of toAdd) {
      if (f.size > maxFileSize) {
        notification.error({
          title: t("chat.fileTooLarge", { max: formatSize(maxFileSize) }),
        });
        continue;
      }
      valid.push(f);
    }

    if (valid.length > 0) {
      setAttachedFiles((prev) => [...prev, ...valid].slice(0, maxFiles));
    }
  }, [attachedFiles.length, maxFiles, maxFileSize, notification, t]);

  const removeFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  // ---- drag & drop ----

  const handleDragEnter = (e: DragEvent) => {
    if (!allowFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDragOver = (e: DragEvent) => {
    if (!allowFiles) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!allowFiles) return;
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  // ---- render ----

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getBubbleClass = (role: string) => {
    if (role === "master" || role === "builder") return styles.masterBubble;
    return styles.playerBubble;
  };

  const getAvatarIcon = (role: string) => {
    if (role === "builder") return <CodeOutlined />;
    if (role === "master") return <RobotOutlined />;
    return <UserOutlined />;
  };

  const renderBubble = (msg: IMessage) => (
    <div
      key={msg.id}
      className={`${styles.messageRow} ${(msg.role === "master" || msg.role === "builder") ? styles.masterRow : styles.playerRow}`}
    >
      <Avatar
        size={32}
        src={msg.avatarUrl}
        icon={getAvatarIcon(msg.role)}
        className={styles.msgAvatar}
      />
      <div className={styles.msgContent}>
        <div className={styles.sender}>{msg.sender}</div>
        <div className={styles.bubbleRow}>
          <div className={`${styles.bubble} ${getBubbleClass(msg.role)}`}>
            {msg.prefix}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {String(msg.text)}
            </ReactMarkdown>
          </div>
          <div className={styles.actions}>
            <Tooltip title={t("chat.copy")} placement="top">
              <button className={styles.actionBtn} onClick={() => handleCopy(String(msg.text))}>
                <CopyOutlined />
              </button>
            </Tooltip>
            {!hideShare && (
              <Tooltip title={t("chat.share")} placement="top">
                <button className={styles.actionBtn}>
                  <ShareAltOutlined />
                </button>
              </Tooltip>
            )}
            {onDelete && !msg.summarized && (
              <Tooltip
                title={confirmDelete === msg.id ? (t("chat.deleteConfirm") || "Нажми ещё раз") : (t("chat.delete") || "Удалить")}
                placement="top"
              >
                <button
                  className={`${styles.actionBtn} ${confirmDelete === msg.id ? styles.deleteConfirming : ""}`}
                  onClick={() => {
                    if (confirmDelete === msg.id) {
                      onDelete(msg.id);
                      setConfirmDelete(null);
                      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                    } else {
                      setConfirmDelete(msg.id);
                      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                      confirmTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
                    }
                  }}
                  onBlur={() => {
                    // Reset on focus loss (with small delay to allow click)
                    confirmTimerRef.current = setTimeout(() => setConfirmDelete(null), 200);
                  }}
                >
                  <DeleteOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const grouped = groupMessages(messages);

  return (
    <div
      className={`${styles.panel} ${dragOver ? styles.dragOver : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && allowFiles && (
        <div className={styles.dropOverlay}>
          <FileOutlined style={{ fontSize: 32, color: "var(--text-dim)" }} />
          <div className={styles.dropText}>{t("chat.dropHere")}</div>
        </div>
      )}

      {(title || onHistoryClick) && (
        <div className={styles.header}>
          <span className={styles.headerTitle}>{title || t("chat.gameChat")}</span>
          <div className={styles.headerActions}>
            {onClearChat && (
              <Popconfirm
                title={t("chat.clearConfirm") || "Очистить чат?"}
                description={t("chat.clearDesc") || "Все сообщения и саммари будут удалены"}
                onConfirm={onClearChat}
                okText={t("chat.clear") || "Очистить"}
                cancelText={t("common.cancel")}
                placement="bottomRight"
              >
                <Tooltip title={t("chat.clearChat") || "Очистить чат"} placement="bottom">
                  <Button type="text" size="small" icon={<ClearOutlined />} className={styles.headerBtn} />
                </Tooltip>
              </Popconfirm>
            )}
            {onHistoryClick && (
              <Tooltip title={t("chat.showFullHistory") || "Показать всю историю"} placement="bottom">
                <Button type="text" size="small" icon={<HistoryOutlined />} onClick={onHistoryClick} className={styles.headerBtn} />
              </Tooltip>
            )}
          </div>
        </div>
      )}
      <div className={styles.inner} ref={scrollRef}>
        <div className={styles.messages}>
          {grouped.map((group) => {
            if (group.event) {
              const eventId = group.event.ids[0];
              const expanded = expandedEvents[eventId];
              return (
                <div key={`event-${eventId}`}>
                  <button className={styles.eventLine} onClick={() => toggleEvent(eventId)}>
                    <span className={styles.eventDot} />
                    <span className={styles.eventText}>
                      {group.event.sender} {t("chat.sharedEvent")}
                    </span>
                    {expanded ? <DownOutlined className={styles.eventArrow} /> : <RightOutlined className={styles.eventArrow} />}
                    <span className={styles.eventDot} />
                  </button>
                  {expanded && (
                    <div className={styles.expandedShared}>
                      {group.messages.map(renderBubble)}
                    </div>
                  )}
                </div>
              );
            }
            return group.messages.map(renderBubble);
          })}
          {typing && (
            <div className={`${styles.messageRow} ${styles.masterRow}`}>
              <Avatar size={32} icon={<CodeOutlined />} className={styles.msgAvatar} />
              <div className={styles.msgContent}>
                <div className={styles.sender}>Builder</div>
                <div className={`${styles.bubble} ${styles.masterBubble} ${styles.typingBubble}`}>
                  {stopping ? (
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Stopping...</span>
                  ) : liveStep ? (
                    <div className={styles.liveStepsLine}>
                      {getStepIcon(liveStep.tool)}
                      <span>
                        {(() => {
                          const exclude = lastLabelRef.current.get(liveStep.tool);
                          const label = getStepLabel(liveStep.tool, t, exclude);
                          lastLabelRef.current.set(liveStep.tool, label);
                          return label;
                        })()}{liveStep.detail ? ` (${liveStep.detail})` : ""}
                      </span>
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                    </div>
                  ) : (
                    <>
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.inputBar}>
        {disabled && disabledText && (
          <div className={styles.devBanner}>{disabledText}</div>
        )}

        {/* attached file chips */}
        {allowFiles && attachedFiles.length > 0 && (
          <div className={styles.fileChips}>
            {attachedFiles.map((f, i) => (
              <Tag
                key={`${f.name}-${i}`}
                closable
                onClose={() => removeFile(i)}
                icon={<FileOutlined />}
                className={styles.fileChip}
              >
                {truncateFileName(f.name)}
              </Tag>
            ))}
          </div>
        )}

        <div className={styles.inputInner}>
          {allowFiles && (
            <>
              <Tooltip title={t("chat.attachFile")}>
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined />}
                  className={styles.attachBtn}
                  disabled={sending || attachedFiles.length >= maxFiles}
                  onClick={handleAttachClick}
                />
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptFiles}
                multiple
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </>
          )}
          <Input.TextArea
            placeholder={placeholder || t("chat.placeholder")}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className={styles.input}
            disabled={disabled || sending || typing}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {typing ? (
            onStop && !stopping ? (
              <Tooltip title={t("chat.stop")}>
                <Button
                  type="default"
                  icon={<StopOutlined />}
                  className={`${styles.sendBtn} ${styles.stopBtn}`}
                  onClick={onStop}
                />
              </Tooltip>
            ) : (
              <Button
                type="default"
                icon={<SendOutlined />}
                className={styles.sendBtn}
                disabled
              />
            )
          ) : (
            <Button
              type="default"
              icon={<SendOutlined />}
              className={styles.sendBtn}
              disabled={disabled || sending}
              loading={sending}
              onClick={handleSend}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Format bytes to human-readable string */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncate a filename for display: keep extension, trim middle */
function truncateFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name.length > 24 ? name.slice(0, 22) + "…" : name;
  const ext = name.slice(dot);
  const base = name.slice(0, dot);
  if (name.length <= 28) return name;
  return base.slice(0, 20) + "…" + ext;
}
