"use client";

import { Dropdown, Modal, Input, App } from "antd";
import { DownOutlined, PlusOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  listGamesAction,
  getCurrentGameAction,
  createGameAction,
  type IGameItem,
} from "@/src/shared/actions/admin/games";
import { switchGameAction } from "@/src/shared/actions/admin/switch-game";
import styles from "./game-selector.module.css";

interface IGameSelectorProps {
  isAdmin: boolean;
  onGameChange: () => void;
}

export const GameSelector = ({ isAdmin, onGameChange }: IGameSelectorProps) => {
  const { t } = useTranslation();
  const [games, setGames] = useState<IGameItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { notification } = App.useApp();

  useEffect(() => { loadGames(); }, []);

  const loadGames = async () => {
    const [list, current] = await Promise.all([listGamesAction(), getCurrentGameAction()]);
    setGames(list);
    setCurrentId(current?.id || null);
  };

  const currentGame = games.find((g) => g.id === currentId);

  const handleCreate = async () => {
    setCreating(true);
    const result = await createGameAction(newName);
    setCreating(false);
    if (result.success) {
      setNewName("");
      setModalOpen(false);
      if (result.id) {
        await switchGameAction(result.id);
        await loadGames();
        onGameChange();
      }
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleSwitch = async (id: string) => {
    setDropdownOpen(false);
    const result = await switchGameAction(id);
    if (result.success) {
      await loadGames();
      onGameChange();
    }
  };

  if (!isAdmin) {
    return (
      <div className={styles.selector}>
        <div className={`${styles.trigger} ${styles.readonly} ${!currentId ? styles.triggerEmpty : ""}`}>
          <span className={styles.label}>{currentGame?.name || t("gameSelector.noGame")}</span>
        </div>
      </div>
    );
  }

  const menuItems = {
    items: [
      ...games.map((g) => ({
        key: g.id,
        label: (
          <span>{g.name}{g.isCurrent && <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 6 }}>{t("gameSelector.current")}</span>}</span>
        ),
        onClick: () => handleSwitch(g.id),
      })),
      { type: "divider" as const },
      { key: "create", label: t("gameSelector.createGame"), icon: <PlusOutlined />, onClick: () => setModalOpen(true) },
    ],
  };

  return (
    <>
      <div className={styles.selector}>
        <Dropdown menu={menuItems} open={dropdownOpen} onOpenChange={setDropdownOpen} trigger={["click"]} placement="bottomLeft">
          <button className={`${styles.trigger} ${!currentId ? styles.triggerEmpty : ""}`}>
            <span className={styles.label}>{currentGame?.name || t("gameSelector.chooseGame")}</span>
            <DownOutlined className={styles.arrow} />
          </button>
        </Dropdown>
      </div>
      <Modal
        title={t("gameSelector.newGame")} open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={handleCreate} confirmLoading={creating} okText={t("gameSelector.create")} cancelText={t("gameSelector.cancel")} centered
      >
        <Input placeholder={t("gameSelector.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} style={{ marginTop: 8 }} />
      </Modal>
    </>
  );
};
