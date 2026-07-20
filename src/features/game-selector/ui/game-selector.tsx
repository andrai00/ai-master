"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownOutlined } from "@ant-design/icons";
import {
  listGamesAction,
  getCurrentGameAction,
} from "@/src/shared/actions/admin/games";
import { GamesManagerModal } from "./games-manager-modal";
import styles from "./game-selector.module.css";

interface IGameSelectorProps {
  isAdmin: boolean;
  onGameChange: () => void;
}

export const GameSelector = ({ isAdmin, onGameChange }: IGameSelectorProps) => {
  const { t } = useTranslation();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { loadCurrent(); }, []);

  const loadCurrent = async () => {
    const [list, current] = await Promise.all([listGamesAction(), getCurrentGameAction()]);
    const found = list.find((g) => g.id === current?.id);
    setCurrentId(current?.id || null);
    setCurrentName(found?.name || current?.name || "");
  };

  const handleModalClose = () => {
    setModalOpen(false);
    loadCurrent();
    onGameChange();
  };

  if (!isAdmin) {
    return (
      <div className={styles.selector}>
        <div className={`${styles.trigger} ${styles.readonly} ${!currentId ? styles.triggerEmpty : ""}`}>
          <span className={styles.label}>{currentName || t("gameSelector.noGame")}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.selector}>
        <button className={`${styles.trigger} ${!currentId ? styles.triggerEmpty : ""}`} onClick={() => setModalOpen(true)}>
          <span className={styles.label}>{currentName || t("gameSelector.chooseGame")}</span>
          <DownOutlined className={styles.arrow} />
        </button>
      </div>
      <GamesManagerModal open={modalOpen} onClose={handleModalClose} onGameChanged={onGameChange} />
    </>
  );
};
