"use client";

import { Modal, Table, Button, Input, App, Popconfirm, Space } from "antd";
import { EditOutlined, DeleteOutlined, SwapOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  listGamesAction,
  createGameAction,
  updateGameAction,
  deleteGameAction,
  deleteGameWithInfoAction,
  type IGameItem,
} from "@/src/shared/actions/admin/games";
import { switchGameAction } from "@/src/shared/actions/admin/switch-game";
import type { ColumnsType } from "antd/es/table";

interface IGamesManagerProps {
  open: boolean;
  onClose: () => void;
  onGameChanged: () => void;
}

export const GamesManagerModal = ({ open, onClose, onGameChanged }: IGamesManagerProps) => {
  const { t } = useTranslation();
  const [games, setGames] = useState<IGameItem[]>([]);
  const [filtered, setFiltered] = useState<IGameItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const { notification } = App.useApp();

  useEffect(() => {
    if (open) loadGames();
  }, [open]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games);
  }, [games, search]);

  const loadGames = async () => {
    setLoading(true);
    setGames(await listGamesAction());
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const result = await createGameAction(newName);
    setCreating(false);
    if (result.success) {
      setNewName("");
      notification.success({ title: t("admin.playerCreated") });
      await loadGames();
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    const result = await updateGameAction(editId, editName);
    if (result.success) {
      setEditId(null);
      await loadGames();
      onGameChanged();
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleSwitch = async (game: IGameItem) => {
    const result = await switchGameAction(game.id);
    if (result.success) {
      await loadGames();
      onGameChanged();
      notification.success({ title: t("gameSelector.switched") });
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleDelete = async (game: IGameItem) => {
    const info = await deleteGameWithInfoAction(game.id);
    if (!info.success) {
      notification.error({ title: info.error });
      return;
    }
    await deleteGameAction(game.id);
    await loadGames();
    onGameChanged();
    notification.success({ title: t("gameSelector.deleted") });
  };

  const columns: ColumnsType<IGameItem> = [
    {
      title: t("gameSelector.nameCol"), key: "name",
      render: (_: unknown, record) => {
        if (editId === record.id) {
          return (
            <Input
              size="small"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onPressEnter={handleSaveEdit}
              onBlur={handleSaveEdit}
              autoFocus
            />
          );
        }
        return (
          <span style={{ fontWeight: record.isCurrent ? 600 : 400 }}>
            {record.name}
            {record.isCurrent && (
              <span style={{ color: "var(--text-dim)", fontSize: 10, marginLeft: 6 }}>{t("gameSelector.current")}</span>
            )}
          </span>
        );
      },
    },
    {
      title: "", key: "actions", width: 100,
      render: (_: unknown, record) => (
        <Space size={4}>
          {!record.isCurrent && (
            <Button type="text" size="small" icon={<SwapOutlined />} onClick={() => handleSwitch(record)} title={t("gameSelector.switch")} />
          )}
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditId(record.id); setEditName(record.name); }} />
          <Popconfirm
            title={t("gameSelector.deleteConfirm")}
            description={t("gameSelector.deleteWarn")}
            onConfirm={() => handleDelete(record)}
            okText={t("gameSelector.deleteOk")}
            cancelText={t("gameSelector.cancel")}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={t("gameSelector.manageGames")}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={520}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Space style={{ width: "100%" }}>
          <Input
            placeholder={t("gameSelector.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ flex: 1 }}
          />
        </Space>

        <div style={{ display: "flex", gap: 8 }}>
          <Input
            placeholder={t("gameSelector.namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleCreate}
            style={{ flex: 1 }}
          />
          <Button onClick={handleCreate} loading={creating}>{t("gameSelector.create")}</Button>
        </div>

        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ size: "small", pageSize: 5 }}
          size="small"
          showHeader={false}
          locale={{ emptyText: t("gameSelector.noGames") }}
        />
      </div>
    </Modal>
  );
};
