"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { useCurrentGame } from "@/src/shared/api/admin/useCurrentGame";
import { GamesManagerModal } from "./games-manager-modal";
import styles from "./game-selector.module.css";

interface IGameSelectorProps {
  isAdmin: boolean;
  onGameChange: () => void;
}

export const GameSelector = ({ isAdmin, onGameChange }: IGameSelectorProps) => {
  const { t } = useTranslation();
  const { data: current } = useCurrentGame();
  const [modalOpen, setModalOpen] = useState(false);

  const name = current?.name || t("gameSelector.noGame");
  const firstLetter = name.charAt(0).toUpperCase();

  if (!isAdmin) {
    return (
      <span className={styles.title} title={name}>
        {name}
      </span>
    );
  }

  return (
    <>
      <Tooltip title={t("gameSelector.manageGames")} placement="right">
        <button
          className={styles.titleBtn}
          onClick={() => setModalOpen(true)}
          aria-label={t("gameSelector.manageGames")}
        >
          <span className={styles.titleText}>{name}</span>
          <DownOutlined className={styles.titleIcon} />
        </button>
      </Tooltip>
      <GamesManagerModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); onGameChange(); }}
        onGameChanged={onGameChange}
      />
    </>
  );
};

export const GameSelectorCollapsed = ({ isAdmin, onGameChange }: IGameSelectorProps) => {
  const { t } = useTranslation();
  const { data: current } = useCurrentGame();
  const [modalOpen, setModalOpen] = useState(false);

  const name = current?.name || t("gameSelector.noGame");
  const firstLetter = name.charAt(0).toUpperCase();

  if (!isAdmin) {
    return (
      <Tooltip title={name} placement="right">
        <span className={styles.collapsedLetter}>{firstLetter}</span>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip title={`${name} — ${t("gameSelector.manageGames")}`} placement="right">
        <button
          className={styles.collapsedBtn}
          onClick={() => setModalOpen(true)}
          aria-label={t("gameSelector.manageGames")}
        >
          {firstLetter}
        </button>
      </Tooltip>
      <GamesManagerModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); onGameChange(); }}
        onGameChanged={onGameChange}
      />
    </>
  );
};
