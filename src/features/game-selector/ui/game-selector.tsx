"use client";

import { Select, Modal, Input, Button, App } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import {
  listGamesAction,
  createGameAction,
  type IGameItem,
} from "@/src/shared/actions/admin/games";
import { switchGameAction } from "@/src/shared/actions/admin/switch-game";

interface IGameSelectorProps {
  masterId?: string;
  onChange: (id: string) => void;
}

export const GameSelector = ({ masterId, onChange }: IGameSelectorProps) => {
  const [games, setGames] = useState<IGameItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { notification } = App.useApp();

  useEffect(() => {
    listGamesAction().then(setGames);
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    const result = await createGameAction(newName);
    setCreating(false);
    if (result.success) {
      const updated = await listGamesAction();
      setGames(updated);
      setNewName("");
      setModalOpen(false);
      if (result.id) {
        await switchGameAction(result.id);
        onChange(result.id);
      }
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleSwitch = async (id: string) => {
    const result = await switchGameAction(id);
    if (result.success) {
      onChange(id);
    }
  };

  return (
    <>
      <Select
        value={masterId || undefined}
        onChange={handleSwitch}
        placeholder="Выберите игру"
        style={{ width: "100%", marginTop: 6 }}
        size="small"
        variant="borderless"
        dropdownRender={(menu) => (
          <>
            {menu}
            <div style={{ padding: "4px 8px", borderTop: "1px solid var(--border)" }}>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                block
                style={{ textAlign: "left", fontSize: 12 }}
                onClick={() => setModalOpen(true)}
              >
                Создать игру
              </Button>
            </div>
          </>
        )}
        options={games.map((g) => ({
          value: g.id,
          label: g.name,
        }))}
      />
      <Modal
        title="Новая игра"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Создать"
        cancelText="Отмена"
        centered
      >
        <Input
          placeholder="Название игры"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  );
};
