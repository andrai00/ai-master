"use client";

import { Modal, Table, Button, Input, App, Popconfirm, Space } from "antd";
import { EditOutlined, DeleteOutlined, SwapOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useListGames } from "@/src/shared/api/admin/use-list-games";
import { useCreateGame } from "@/src/shared/api/admin/use-create-game";
import { useUpdateGame } from "@/src/shared/api/admin/use-update-game";
import { useSwitchGame } from "@/src/shared/api/admin/use-switch-game";
import { useDeleteGame } from "@/src/shared/api/admin/use-delete-game";
import type { IGameItem } from "@/src/shared/actions/admin/games";
import type { ColumnsType } from "antd/es/table";

interface IGamesManagerProps {
  open: boolean;
  onClose: () => void;
  onGameChanged: () => void;
}

export const GamesManagerModal = ({ open, onClose, onGameChanged }: IGamesManagerProps) => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: games = [], isLoading } = useListGames();
  const createMutation = useCreateGame();
  const updateMutation = useUpdateGame();
  const switchMutation = useSwitchGame();
  const deleteMutation = useDeleteGame();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games;
  }, [games, search]);

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate(newName, { onSuccess: () => { setNewName(""); onGameChanged(); } });
    }
  };

  const handleSaveEdit = () => {
    if (editId && editName.trim()) {
      updateMutation.mutate({ id: editId, name: editName }, { onSuccess: () => { setEditId(null); onGameChanged(); } });
    }
  };

  const handleSwitch = (id: string) => {
    switchMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ title: t("gameSelector.switched") }); } });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ title: t("gameSelector.deleted") }); } });
  };

  const columns: ColumnsType<IGameItem> = [
    {
      title: t("gameSelector.nameCol"), key: "name",
      render: (_: unknown, record) => {
        if (editId === record.id) {
          return <Input size="small" value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={handleSaveEdit} onBlur={handleSaveEdit} autoFocus />;
        }
        return (
          <span style={{ fontWeight: record.isCurrent ? 600 : 400 }}>
            {record.name}
            {record.isCurrent && <span style={{ color: "var(--text-dim)", fontSize: 10, marginLeft: 6 }}>{t("gameSelector.current")}</span>}
          </span>
        );
      },
    },
    {
      title: "", key: "actions", width: 100,
      render: (_: unknown, record) => (
        <Space size={4}>
          {!record.isCurrent && <Button type="text" size="small" icon={<SwapOutlined />} onClick={() => handleSwitch(record.id)} title={t("gameSelector.switch")} />}
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditId(record.id); setEditName(record.name); }} />
          <Popconfirm title={t("gameSelector.deleteConfirm")} description={t("gameSelector.deleteWarn")} onConfirm={() => handleDelete(record.id)}
            okText={t("gameSelector.deleteOk")} cancelText={t("gameSelector.cancel")}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal title={t("gameSelector.manageGames")} open={open} onCancel={onClose} footer={null} centered width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input placeholder={t("gameSelector.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
        <div style={{ display: "flex", gap: 8 }}>
          <Input placeholder={t("gameSelector.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={handleCreate} style={{ flex: 1 }} />
          <Button onClick={handleCreate} loading={createMutation.isPending}>{t("gameSelector.create")}</Button>
        </div>
        <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading}
          pagination={{ size: "small", pageSize: 5 }} size="small" showHeader={false}
          locale={{ emptyText: t("gameSelector.noGames") }} />
      </div>
    </Modal>
  );
};
