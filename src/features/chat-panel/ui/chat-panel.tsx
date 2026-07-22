"use client";

import { Input, Button, Avatar, Tooltip, App, Popconfirm } from "antd";
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
} from "@ant-design/icons";
import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import styles from "./chat-panel.module.css";

export interface IStepLabel {
  tool: string;
}

export interface IMessage {
  id: string;
  sender: string;
  role: string;
  text: ReactNode;
  avatarUrl?: string;
  shared?: boolean;
  summarized?: boolean;
  steps?: IStepLabel[];
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
  onSend?: (text: string) => void;
  sending?: boolean;
  typing?: boolean;
}

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
  const style = { fontSize: 12, marginRight: 2, opacity: 0.6 };
  switch (tool) {
    case "read_parsed_file":
      return <FileTextOutlined style={style} />;
    case "list_uploaded_files":
      return <UnorderedListOutlined style={style} />;
    case "create_document":
      return <FileAddOutlined style={style} />;
    case "update_document":
      return <EditOutlined style={style} />;
    case "read_document":
      return <ReadOutlined style={style} />;
    case "search_documents":
      return <SearchOutlined style={style} />;
    case "final":
      return <CommentOutlined style={style} />;
    default:
      return null;
  }
}

function getStepLabel(tool: string, t: (key: string) => string): string {
  return t(`builder.steps.${tool}`);
}

export const ChatPanel = ({ messages, placeholder, disabled, disabledText, hideShare, title, onDelete, onHistoryClick, onClearChat, onSend, sending, typing }: IChatPanelProps) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

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
    if (!text || !onSend) return;
    onSend(text);
    setInputValue("");
  };

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
            {msg.text}
            {msg.steps && msg.steps.length > 0 && (
              <div className={styles.steps}>
                {msg.steps.map((s, i) => (
                  <span key={i} className={styles.stepItem}>
                    {getStepIcon(s.tool)}
                    <span className={styles.stepLabel}>{getStepLabel(s.tool, t)}</span>
                    {i < msg.steps!.length - 1 && <span className={styles.stepArrow}>→</span>}
                  </span>
                ))}
              </div>
            )}
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
              <Popconfirm
                title={t("chat.deleteConfirm") || "Удалить сообщение?"}
                onConfirm={() => onDelete(msg.id)}
                okText={t("common.delete")}
                cancelText={t("common.cancel")}
                placement="top"
              >
                <Tooltip title={t("chat.delete") || "Удалить"} placement="top">
                  <button className={styles.actionBtn}>
                    <DeleteOutlined />
                  </button>
                </Tooltip>
              </Popconfirm>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const grouped = groupMessages(messages);

  return (
    <div className={styles.panel}>
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
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
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
        <div className={styles.inputInner}>
          <Input.TextArea
            placeholder={placeholder || t("chat.placeholder")}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className={styles.input}
            disabled={disabled || sending}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            type="default"
            icon={<SendOutlined />}
            className={styles.sendBtn}
            disabled={disabled || sending}
            loading={sending}
            onClick={handleSend}
          />
        </div>
      </div>
    </div>
  );
};
