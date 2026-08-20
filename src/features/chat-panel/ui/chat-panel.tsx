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
  UnorderedListOutlined,
  FileAddOutlined,
  EditOutlined,
  ReadOutlined,
  SearchOutlined,
  CommentOutlined,
  PaperClipOutlined,
  FileOutlined,
  MenuOutlined,
  StopOutlined,
  LoadingOutlined,
  BookOutlined,
  PictureOutlined,
  LinkOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useRef, useEffect, useState, useCallback, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkWikiLink } from "@/src/features/md-viewer/model/remark-wiki-link";
import { remarkChatLink } from "@/src/features/md-viewer/model/remark-chat-link";
import { ChatNavLink } from "@/src/features/md-viewer/ui/chat-nav-link";
import { useDocumentPreview } from "@/src/shared/ui/document-preview-provider";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";
import { useMobileMenu } from "@/src/shared/ui/page-header";
import { subscribeStep, subscribeReconnect } from "@/src/shared/lib/realtime/client";
import type { IRealtimeStepEvent } from "@/src/shared/lib/realtime/client";
import type { ITranscriptRow } from "@/src/shared/actions/agents/get-agent-transcript";
import styles from "./chat-panel.module.css";

/** Reusable wiki-link renderer for chat messages */
const wikiComponents = (onWikiClick: (docId: string, anchor?: string) => void): Components => ({
  span(props) {
    const { node, children, ...rest } = props;
    const properties = (node?.properties as Record<string, string> | undefined);
    // rehype-raw normalizes data-* attributes to camelCase when it re-parses
    // HTML — always read both spellings so links render everywhere.
    const read = (key: string) => {
      if (!properties) return undefined;
      const camel = key.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
      return properties[key] ?? properties[camel];
    };
    const href = read("data-wiki-link");
    if (href) {
      const [docId, anchor] = href.split("|");
      const display = read("data-wiki-display") || docId;
      return (
        <button
          type="button"
          onClick={() => onWikiClick(docId!, anchor || undefined)}
          style={{
            background: "none",
            border: "none",
            borderBottom: "1px dashed var(--text-primary)",
            color: "var(--text-primary)",
            cursor: "pointer",
            font: "inherit",
            padding: 0,
          }}
        >
          {display}
        </button>
      );
    }
    const chatLink = read("data-chat-link");
    if (chatLink) {
      return <ChatNavLink chatKey={chatLink} />;
    }
    return <span {...rest}>{children}</span>;
  },
  a(props) {
    const { href, children } = props;
    if (href && /^#/.test(href)) {
      // Same-document anchor — scroll within current modal
      return <span style={{ color: "var(--text-dim)" }}>{children}</span>;
    }
    if (href && /^\/doc\/([a-zA-Z0-9-]+)(?:#(.+))?$/.test(href)) {
      const m = href.match(/^\/doc\/([a-zA-Z0-9-]+)(?:#(.+))?$/);
      const docId = m![1]!;
      const anchor = m![2] || undefined;
      return (
        <button
          type="button"
          onClick={() => onWikiClick(docId!, anchor)}
          style={{
            background: "none",
            border: "none",
            borderBottom: "1px dashed var(--text-primary)",
            color: "var(--text-primary)",
            cursor: "pointer",
            font: "inherit",
            padding: 0,
          }}
        >
          {children}
        </button>
      );
    }
    // Any site-relative path (e.g. /spells/223-feather_fall/,
    // /classes/101-sorcerer.md#anchor) is an internal document link.
    // Protocol-relative (//cdn...) stays external. Leading/trailing
    // slashes and .md extension are stripped — the modal resolves the
    // path via resolveDocumentByPath.
    if (href && /^\/(?!\/)/.test(href)) {
      const [pathPart, hashPart] = href.split("#");
      const cleanPath = (pathPart ?? "")
        .replace(/\.md$/i, "")
        .replace(/^\/+|\/+$/g, "");
      if (cleanPath) {
        return (
          <button
            type="button"
            onClick={() => onWikiClick(cleanPath, hashPart || undefined)}
            style={{
              background: "none",
              border: "none",
              borderBottom: "1px dashed var(--text-primary)",
              color: "var(--text-primary)",
              cursor: "pointer",
              font: "inherit",
              padding: 0,
            }}
          >
            {children}
          </button>
        );
      }
    }
    return (
      <span>
        <span style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: "var(--text-muted)" }}>
          {children}
        </span>
        <a href={href} target="_blank" rel="noopener noreferrer" className={styles.extIcon}>
          &#x2197;
        </a>
      </span>
    );
  },
});

export interface IMessage {
  id: string;
  sender: string;
  role: string;
  text: ReactNode;
  avatarUrl?: string;
  shared?: boolean;
  summarized?: boolean;
  plan?: boolean;
  runId?: string;
  attachedFiles?: { fileId: string; filename: string }[];
  prefix?: ReactNode;
  isRollEntry?: boolean;
  rollCheckName?: string;
  rollResult?: string;
  rollDetail?: string;
  rollExpression?: string;
  rollTimestamp?: number;
}

interface IChatPanelProps {
  messages: IMessage[];
  placeholder?: string;
  disabled?: boolean;
  disabledText?: string;
  hideShare?: boolean;
  title?: string;
  onDelete?: (id: string) => void;
  onShare?: (id: string) => void;
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
  /** Session ID for real-time step tracking (game/personal/builder chat) */
  stepsSessionId?: string;
  /** Called when first step event arrives (processing started) */
  onStepsStart?: () => void;
  /** Called when SSE reports processing is done */
  onStepsDone?: () => void;
  /** Called when SSE reports an error */
  onStepsError?: (message: string) => void;
  /** Called every time the SSE connection (re)opens — used to resync state */
  onStepsResync?: () => void;
  /** Called for each SSE step event (individual tool call during processing) */
  onToolStep?: (tool: string) => void;
  /** True while stop is in progress (waiting for abort to complete) */
  stopping?: boolean;
  /** Optional element to render inside the input bar, between attach button and text input */
  inputPrefix?: ReactNode;
  /** Optional action rendered between messages area and input bar */
  footerAction?: ReactNode;
  /** Optional roll strip rendered between messages area and input bar */
  rollStrip?: ReactNode;
  /** Sender name shown on the typing bubble (defaults to Builder label) */
  typingSender?: string;
  /** Debug mode (AGENT_DEBUG=1): per-run agent transcript rows for the internals block */
  debugRows?: Record<string, ITranscriptRow[]>;
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
    case "list_uploaded_files":
      return <UnorderedListOutlined style={iconStyle} />;
    case "create_document":
      return <FileAddOutlined style={iconStyle} />;
    case "update_document":
      return <EditOutlined style={iconStyle} />;
    case "read_document":
      return <ReadOutlined style={iconStyle} />;
    case "search_rules":
      return <SearchOutlined style={iconStyle} />;
    case "glossary_overview":
      return <SearchOutlined style={iconStyle} />;
    case "get_brain":
      return <BookOutlined style={iconStyle} />;
    case "get_gm_notes":
      return <CommentOutlined style={iconStyle} />;
    case "get_scene_state":
      return <PictureOutlined style={iconStyle} />;
    case "get_player_sheet":
      return <UserOutlined style={iconStyle} />;
    case "get_players":
      return <TeamOutlined style={iconStyle} />;
    case "resolve_glossary_link":
      return <LinkOutlined style={iconStyle} />;
    case "final":
      return <CommentOutlined style={iconStyle} />;
    default:
      return null;
  }
}

function getStepLabel(tool: string, t: (key: string, opts?: { returnObjects?: boolean }) => unknown, exclude?: string): string {
  const key = `builder.steps.${tool}`;
  const raw = t(key, { returnObjects: true });
  // If it's an array of phrases, pick one randomly (excluding last used)
  if (Array.isArray(raw)) {
    const pool = raw as string[];
    const available = exclude ? pool.filter((p) => p !== exclude) : pool;
    return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : pool[0];
  }
  return raw as string;
}

export const ChatPanel = ({
  messages, placeholder, disabled, disabledText, hideShare, title,
  onDelete, onShare, onHistoryClick, onClearChat, onSend, onStop,
  sending, typing,
  allowFiles, acceptFiles, maxFiles = DEFAULT_MAX_FILES, maxFileSize = DEFAULT_MAX_SIZE,
  stepsSessionId, stopping, onStepsDone, onStepsStart, onStepsError, onStepsResync, onToolStep,
  inputPrefix, footerAction, rollStrip, typingSender, debugRows,
}: IChatPanelProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isMobile, toggle } = useMobileMenu();
  const { notification } = App.useApp();
  const { openDocument } = useDocumentPreview();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [liveStep, setLiveStep] = useState<{ tool: string; detail?: string } | null>(null);
  const [streamedText, setStreamedText] = useState("");

  const handleWikiClick = useCallback((docId: string, anchor?: string) => {
    openDocument(docId, anchor);
  }, [openDocument]);
  const [stepLabel, setStepLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLabelRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!liveStep) return;
    const exclude = lastLabelRef.current.get(liveStep.tool);
    const label = getStepLabel(liveStep.tool, t, exclude);
    lastLabelRef.current.set(liveStep.tool, label);
    setStepLabel(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStep]);

  // Subscribe to step events from the unified realtime stream (owned by Shell).
  useEffect(() => {
    if (!stepsSessionId) return;

    let started = false;

    const handleStep = (data: IRealtimeStepEvent) => {
      switch (data.type) {
        case "started":
          started = true;
          setStreamedText("");
          onStepsStart?.();
          break;
        case "step": {
          const tool = data.tool ?? "";
          if (!started) { started = true; onStepsStart?.(); }
          setLiveStep({ tool, detail: data.detail });
          onToolStep?.(tool);
          queryClient.invalidateQueries({ queryKey: ["builder", "file-progress"] });
          break;
        }
        case "text":
          if (data.detail) setStreamedText((prev) => prev + data.detail);
          break;
        case "stopping":
          setLiveStep(null);
          break;
        case "done":
        case "stopped":
          started = false;
          setLiveStep(null);
          setStreamedText("");
          onStepsDone?.();
          break;
        case "error":
          setStreamedText("");
          onStepsError?.(data.message ?? t("errors.unknownError"));
          break;
      }
    };

    const unsubStep = subscribeStep(stepsSessionId, handleStep);
    const unsubReconnect = subscribeReconnect(() => {
      started = false;
      setLiveStep(null);
      onStepsResync?.();
    });

    return () => {
      unsubStep();
      unsubReconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsSessionId]);

  // Auto-scroll to the newest message only when already near the bottom.
  // If the user scrolled up, do NOT yank them down — show the "jump to
  // bottom" button instead.
  const [atBottom, setAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const SCROLL_BOTTOM_THRESHOLD = 80;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist < SCROLL_BOTTOM_THRESHOLD;
    setAtBottom(nearBottom);
    setShowScrollToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    if (scrollRef.current && atBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // `typing`/`liveStep` re-render the thinking bubble after the message
    // list — re-scroll so it stays visible when the user is at the bottom.
    // When scrolled up, `atBottom` is false and we leave the position alone.
  }, [messages, atBottom, typing, liveStep]);

  // Reset near-bottom when switching chats (session change). State reset is
  // done during render (documented React pattern).
  const [prevStepsSessionId, setPrevStepsSessionId] = useState(stepsSessionId);
  if (prevStepsSessionId !== stepsSessionId) {
    setPrevStepsSessionId(stepsSessionId);
    setAtBottom(true);
    setShowScrollToBottom(false);
  }

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

  const renderBubble = (msg: IMessage) => {
    if (msg.isRollEntry) {
      return (
        <div key={msg.id} className={styles.rollEntry}>
          <Tooltip title={msg.rollDetail ?? msg.rollResult ?? ""}>
            <span className={styles.rollEntryBadge}>
              🎲 {msg.rollCheckName}: <strong>{msg.rollResult ?? ""}</strong>
            </span>
          </Tooltip>
        </div>
      );
    }
    const runRows = msg.runId ? debugRows?.[msg.runId] : undefined;
    const runChain = runRows
      ? [...new Set(runRows.filter((r) => r.kind === "tool-call").map((r) => r.toolName).filter((v): v is string => !!v))].join(" → ")
      : "";
    return (
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
        <div className={styles.sender}>
          {msg.sender}
          {msg.plan && <Tag color="gold" style={{ marginLeft: 8 }}>{t("chat.planTag")}</Tag>}
        </div>
        <div className={styles.bubbleRow}>
          <div className={`${styles.bubble} ${getBubbleClass(msg.role)}`}>
            {msg.prefix}
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkWikiLink, remarkChatLink]}
               components={wikiComponents(handleWikiClick)}
            >
              {String(msg.text)}
            </ReactMarkdown>
          </div>
          <div className={styles.actions}>
            <Tooltip title={t("chat.copy")} placement="top">
              <button className={styles.actionBtn} onClick={() => handleCopy(String(msg.text))}>
                <CopyOutlined />
              </button>
            </Tooltip>
            {!hideShare && onShare && (
              <Tooltip title={t("chat.share")} placement="top">
                <button className={styles.actionBtn} onClick={() => onShare(msg.id)}>
                  <ShareAltOutlined />
                </button>
              </Tooltip>
            )}
            {onDelete && !msg.summarized && !typing && (
              <Tooltip
                title={confirmDelete === msg.id ? t("chat.deleteConfirm") : t("chat.delete")}
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
          {runRows && (
            <details className={styles.debugBlock}>
              <summary>
                {t("chat.debugInternals")}
                {runChain ? <span className={styles.debugChain}> · {runChain}</span> : null}
              </summary>
              {runRows.map((row) => (
                <div key={row.id} className={styles.debugRow}>
                  <span className={styles.debugKind}>{row.kind}{row.status === "aborted" ? " (aborted)" : ""}</span>
                  {row.toolName && <code>{row.toolName}</code>}
                  {row.args && <pre>{shortenDebug(row.args)}</pre>}
                  {row.result && <pre>{shortenDebug(row.result)}</pre>}
                  {row.content && <pre>{shortenDebug(row.content)}</pre>}
                </div>
              ))}
            </details>
          )}
        </div>
      </div>
    </div>
  );
  };

  const grouped = groupMessages(messages);

  return (
    <>
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

      {(title || onHistoryClick || isMobile) && (
        <div className={styles.header}>
          {isMobile && (
            <Button type="text" size="small" icon={<MenuOutlined />} onClick={toggle} className={styles.mobileMenuHeaderBtn} />
          )}
          {(title || onHistoryClick) && <span className={styles.headerTitle}>{title || t("chat.gameChat")}</span>}
          <div className={styles.headerActions}>
            {onClearChat && (
              <Popconfirm
                title={t("chat.clearConfirm")}
                description={t("chat.clearDesc")}
                onConfirm={onClearChat}
                okText={t("chat.clear")}
                cancelText={t("common.cancel")}
                placement="bottomRight"
              >
                <Tooltip title={t("chat.clearChat")} placement="bottom">
                  <Button type="text" size="small" icon={<ClearOutlined />} className={styles.headerBtn} disabled={typing || stopping} />
                </Tooltip>
              </Popconfirm>
            )}
            {onHistoryClick && (
              <Tooltip title={t("chat.showFullHistory")} placement="bottom">
                <Button type="text" size="small" icon={<HistoryOutlined />} onClick={onHistoryClick} className={styles.headerBtn} />
              </Tooltip>
            )}
          </div>
        </div>
      )}
      <div className={styles.inner} ref={scrollRef} onScroll={handleScroll}>
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
                <div className={styles.sender}>{typingSender || t("chat.builderLabel")}</div>
                <div className={`${styles.bubble} ${styles.masterBubble} ${styles.typingBubble}`}>
                  {stopping ? (
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("chat.stopping")}</span>
                  ) : streamedText ? (
                    <div className={styles.streamText}>{streamedText}</div>
                  ) : liveStep ? (
                    <div className={styles.liveStepsLine}>
                      {getStepIcon(liveStep.tool)}
                      <span>
                        {stepLabel}{liveStep.detail ? ` (${liveStep.detail})` : ""}
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
        {showScrollToBottom && (
          <div className={styles.scrollToBottomWrap}>
            <Tooltip title={t("chat.scrollToBottom")} placement="top">
              <button
                type="button"
                className={styles.scrollToBottomBtn}
                onClick={scrollToBottom}
                aria-label={t("chat.scrollToBottom")}
              >
                <DownOutlined />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      {rollStrip}
      {footerAction && (
        <div className={styles.footerAction}>
          {footerAction}
        </div>
      )}
      <div className={styles.inputBar}>
        {typing && (
          <div className={styles.thinkingBanner}>
            <LoadingOutlined spin className={styles.pendingIcon} />
            <span>{t("chat.masterThinking")}</span>
          </div>
        )}
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

        {/* PDF warning bar */}
        {allowFiles && attachedFiles.some((f) => f.name.toLowerCase().endsWith(".pdf")) && (
          <div style={{
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            color: "var(--warning-text)",
            padding: "6px 12px",
            borderRadius: 4,
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
          }}>
            <span style={{ opacity: 0.7 }}>&#9888;</span>
            {t("chat.pdfWarning")}
          </div>
        )}

        <div className={styles.inputInner}>
          {inputPrefix}
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
          {allowFiles && (
            <>
              <Tooltip title={t("chat.attachFile")}>
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined />}
                  className={styles.attachBtn}
                  disabled={sending || typing || attachedFiles.length >= maxFiles}
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
              <Tooltip title={t("chat.send")}>
                <Button
                  type="default"
                  icon={<SendOutlined />}
                  className={styles.sendBtn}
                  disabled
                />
              </Tooltip>
            )
          ) : (
            <Tooltip title={t("chat.send")}>
              <Button
                type="default"
                icon={<SendOutlined />}
                className={styles.sendBtn}
                disabled={disabled || sending}
                loading={sending}
                onClick={handleSend}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
    </>
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

/** Truncate long debug payloads for the internals block */
function shortenDebug(value: string, max = 600): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}
