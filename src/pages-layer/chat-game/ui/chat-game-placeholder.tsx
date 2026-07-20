"use client";

import { useTranslation } from "react-i18next";
import { ChatPanel } from "@/src/features/chat-panel";

interface IChatGamePlaceholderProps {
  disabled?: boolean;
}

export function ChatGamePlaceholder({ disabled }: IChatGamePlaceholderProps) {
  const { t } = useTranslation();

  return (
    <ChatPanel
      messages={[]}
      disabled={disabled}
      disabledText={disabled ? t("chat.devModeDisabled") : undefined}
    />
  );
}
