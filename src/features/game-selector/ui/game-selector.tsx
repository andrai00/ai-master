"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DownOutlined } from "@ant-design/icons";
import { useCurrentGame } from "@/src/shared/api/admin/use-current-game";
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

  if (!isAdmin) {
    return (
      <div className={styles.selector}>
        <div className={`${styles.trigger} ${styles.readonly} ${!current?.id ? styles.triggerEmpty : ""}`}>
          <span className={styles.label}>{current?.name || t("gameSelector.noGame")}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.selector}>
        <button className={`${styles.trigger} ${!current?.id ? styles.triggerEmpty : ""}`} onClick={() => setModalOpen(true)}>
          <span className={styles.label}>{current?.name || t("gameSelector.chooseGame")}</span>
          <DownOutlined className={styles.arrow} />
        </button>
      </div>
      <GamesManagerModal open={modalOpen} onClose={() => { setModalOpen(false); onGameChange(); }} onGameChanged={onGameChange} />
    </>
  );
};
