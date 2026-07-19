"use client";

import { Input, Button, Avatar, Tooltip, App } from "antd";
import {
  SendOutlined,
  UserOutlined,
  RobotOutlined,
  ShareAltOutlined,
  CopyOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import styles from "./chat-panel.module.css";

export interface IMessage {
  id: number;
  sender: string;
  role: "master" | "player";
  text: ReactNode;
  avatarUrl?: string;
  shared?: boolean;
}

interface IChatPanelProps {
  messages: IMessage[];
  placeholder?: string;
}

function groupMessages(messages: IMessage[]) {
  const result: { event?: { ids: number[]; sender: string }; messages: IMessage[] }[] = [];
  let sharedGroup: IMessage[] = [];

  for (const msg of messages) {
    if (msg.shared) {
      sharedGroup.push(msg);
    } else {
      if (sharedGroup.length > 0) {
        result.push({
          event: { ids: sharedGroup.map((m) => m.id), sender: sharedGroup[0].sender },
          messages: sharedGroup,
        });
        sharedGroup = [];
      }
      result.push({ messages: [msg] });
    }
  }

  if (sharedGroup.length > 0) {
    result.push({
      event: { ids: sharedGroup.map((m) => m.id), sender: sharedGroup[0].sender },
      messages: sharedGroup,
    });
  }

  return result;
}

export const ChatPanel = ({ messages, placeholder }: IChatPanelProps) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});

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

  const toggleEvent = (id: number) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderBubble = (msg: IMessage) => (
    <div
      key={msg.id}
      className={`${styles.messageRow} ${msg.role === "master" ? styles.masterRow : styles.playerRow}`}
    >
      <Avatar
        size={32}
        src={msg.avatarUrl}
        icon={msg.role === "master" ? <RobotOutlined /> : <UserOutlined />}
        className={styles.msgAvatar}
      />
      <div className={styles.msgContent}>
        <div className={styles.sender}>{msg.sender}</div>
        <div className={styles.bubbleRow}>
          <div
            className={`${styles.bubble} ${msg.role === "master" ? styles.masterBubble : styles.playerBubble}`}
          >
            {msg.text}
          </div>
          <div className={styles.actions}>
            <Tooltip title={t("chat.copy")} placement="top">
              <button className={styles.actionBtn} onClick={() => handleCopy(String(msg.text))}>
                <CopyOutlined />
              </button>
            </Tooltip>
            <Tooltip title={t("chat.share")} placement="top">
              <button className={styles.actionBtn}>
                <ShareAltOutlined />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );

  const grouped = groupMessages(messages);

  return (
    <div className={styles.panel}>
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
        </div>
      </div>
      <div className={styles.inputBar}>
        <div className={styles.inputInner}>
          <Input.TextArea
            placeholder={placeholder || t("chat.placeholder")}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className={styles.input}
          />
          <Button type="default" icon={<SendOutlined />} className={styles.sendBtn} />
        </div>
      </div>
    </div>
  );
};
