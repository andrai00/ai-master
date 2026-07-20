"use client";

import { Modal, Table, Button, Input, App, Popconfirm, Tooltip } from "antd";
import { EditOutlined, DeleteOutlined, SearchOutlined, PlusOutlined } from "@ant-design/icons";
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
  const [showSearch, setShowSearch] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: games = [], isLoading } = useListGames();
  const createMutation = useCreateGame();
  const updateMutation = useUpdateGame();
  const switchMutation = useSwitchGame();
  const deleteMutation = useDeleteGame();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games;
  }, [games, search]);

  const handleSwitch = (id: string) => {
    switchMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ title: t("gameSelector.switched") }); } });
  };

  const handleSaveEdit = () => {
    if (editId && editName.trim()) {
      updateMutation.mutate({ id: editId, name: editName }, { onSuccess: () => { setEditId(null); onGameChanged(); } });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ title: t("gameSelector.deleted") }); } });
  };

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate(newName, { onSuccess: () => { setNewName(""); setCreateOpen(false); onGameChanged(); } });
    }
  };

  const columns: ColumnsType<IGameItem> = [
    {
      key: "select", width: 32,
      render: (_: unknown, record) => (
        <Tooltip title={record.isCurrent ? t("gameSelector.current") : t("gameSelector.switch")}>
          <span
            onClick={() => !record.isCurrent && handleSwitch(record.id)}
            style={{
              display: "inline-block", width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${record.isCurrent ? "#52c41a" : "var(--text-dim)"}`,
              background: record.isCurrent ? "#52c41a" : "transparent",
              cursor: record.isCurrent ? "default" : "pointer",
              opacity: record.isCurrent ? 1 : 0.5,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { if (!record.isCurrent) e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e) => { if (!record.isCurrent) e.currentTarget.style.opacity = "0.5"; }}
          />
        </Tooltip>
      ),
    },
    {
      title: t("gameSelector.nameCol"), key: "name",
      render: (_: unknown, record) => {
        if (editId === record.id) {
          return <Input size="small" value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={handleSaveEdit} onBlur={handleSaveEdit} autoFocus autoComplete="off" />;
        }
        return <span style={{ fontWeight: record.isCurrent ? 600 : 400 }}>{record.name}</span>;
      },
    },
    {
      key: "actions", width: 56, align: "right" as const,
      render: (_: unknown, record) => (
        <span style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
          <Tooltip title={t("gameSelector.rename")}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditId(record.id); setEditName(record.name); }} />
          </Tooltip>
          <Tooltip title={t("gameSelector.deleteConfirm")}>
            <Popconfirm title={t("gameSelector.deleteConfirm")} description={t("gameSelector.deleteWarn")} onConfirm={() => handleDelete(record.id)}
              okText={t("gameSelector.deleteOk")} cancelText={t("gameSelector.cancel")}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </span>
      ),
    },
  ];

  return (
    <Modal title={t("gameSelector.manageGames")} open={open} onCancel={onClose} footer={null} centered width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {showSearch ? (
            <Input size="small" placeholder={t("gameSelector.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
              allowClear autoFocus style={{ flex: 1 }} onBlur={() => { if (!search) setShowSearch(false); }} />
          ) : (
            <div />
          )}
          <span style={{ display: "flex", gap: 4 }}>
            <Tooltip title={t("gameSelector.searchPlaceholder")}>
              <Button size="small" type="text" icon={<SearchOutlined />} onClick={() => setShowSearch((v) => !v)} />
            </Tooltip>
            <Tooltip title={t("gameSelector.newGame")}>
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />
            </Tooltip>
          </span>
        </div>

        <Table dataSource={filtered} columns={columns} rowKey="id" loading={isLoading}
          pagination={{ size: "small", pageSize: 8, hideOnSinglePage: true }} size="small" showHeader={false}
          locale={{ emptyText: t("gameSelector.noGames") }} />

        <Modal title={t("gameSelector.newGame")} open={createOpen} onCancel={() => setCreateOpen(false)}
          onOk={handleCreate} confirmLoading={createMutation.isPending} okText={t("gameSelector.create")} cancelText={t("gameSelector.cancel")} centered>
          <Input placeholder={t("gameSelector.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={handleCreate} style={{ marginTop: 8 }} autoComplete="off" />
        </Modal>
      </div>
    </Modal>
  );
};
