"use client";

import { useTranslation } from "react-i18next";
import { ChatPanel } from "@/src/features/chat-panel";

interface IChatGamePlaceholderProps {
  disabled?: boolean;
  noGame?: boolean;
}

export function ChatGamePlaceholder({ disabled, noGame }: IChatGamePlaceholderProps) {
  const { t } = useTranslation();

  return (
    <ChatPanel
      messages={[]}
      disabled={disabled || noGame}
      disabledText={
        noGame
          ? t("noGame.chat.title")
          : disabled
            ? t("chat.devModeDisabled")
            : undefined
      }
    />
  );
}
