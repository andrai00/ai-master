"use client";

import { Input, Button } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { useRef, useEffect } from "react";
import type { ReactNode } from "react";
import styles from "./chat-panel.module.css";

interface IMessage {
  id: number;
  sender: string;
  role: "master" | "player";
  text: ReactNode;
}

interface IChatPanelProps {
  messages: IMessage[];
  placeholder?: string;
}

export const ChatPanel = ({ messages, placeholder = "Введите сообщение..." }: IChatPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className={styles.panel}>
      <div className={styles.inner} ref={scrollRef}>
        <div className={styles.messages}>
          {messages.map((msg) => (
            <div key={msg.id} className={`${styles.message} ${msg.role === "master" ? styles.master : styles.player}`}>
              <div className={styles.sender}>{msg.sender}</div>
              <div className={styles.bubble}>{msg.text}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.inputBar}>
        <div className={styles.inputInner}>
          <Input.TextArea
            placeholder={placeholder}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className={styles.input}
          />
          <Button
            type="default"
            icon={<SendOutlined />}
            className={styles.sendBtn}
          />
        </div>
      </div>
    </div>
  );
};
