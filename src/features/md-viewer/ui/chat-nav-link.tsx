"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import styles from "./chat-nav-link.module.css";

const CHAT_ROUTES: Record<string, { labelKey: string; route: string }> = {
  game: { labelKey: "sidebar.chatGame", route: "/" },
  personal: { labelKey: "sidebar.chatMaster", route: "/chat/personal" },
};

interface IChatNavLinkProps {
  chatKey: string;
}

export const ChatNavLink = ({ chatKey }: IChatNavLinkProps) => {
  const { t } = useTranslation();
  const config = CHAT_ROUTES[chatKey];
  if (!config) return <span>:nav-{chatKey}:</span>;

  return (
    <Link href={config.route} className={styles.link}>
      {t(config.labelKey)}
    </Link>
  );
};
