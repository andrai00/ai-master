"use client";

import { Modal, Table, Button, Input, App, Tooltip } from "antd";
import { EditOutlined, DeleteOutlined, SearchOutlined, PlusOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useListGames } from "@/src/shared/api/admin/useListGames";
import { useCreateGame } from "@/src/shared/api/admin/useCreateGame";
import { useUpdateGame } from "@/src/shared/api/admin/useUpdateGame";
import { useSwitchGame } from "@/src/shared/api/admin/useSwitchGame";
import { useDeleteGame } from "@/src/shared/api/admin/useDeleteGame";
import { deleteGameWithInfoAction } from "@/src/shared/actions/admin/manage-games";
import type { IGameItem } from "@/src/shared/actions/admin/manage-games";
import type { ColumnsType } from "antd/es/table";

interface IGamesManagerProps {
  open: boolean;
  onClose: () => void;
  onGameChanged: () => void;
}

export const GamesManagerModal = ({ open, onClose, onGameChanged }: IGamesManagerProps) => {
  const { t } = useTranslation();
  const { notification, modal } = App.useApp();
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
    switchMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ message: t("gameSelector.switched") }); } });
  };

  const handleSaveEdit = () => {
    if (editId && editName.trim()) {
      updateMutation.mutate({ id: editId, name: editName }, { onSuccess: () => { setEditId(null); onGameChanged(); } });
    }
  };

  const handleDelete = async (id: string) => {
    const info = await deleteGameWithInfoAction(id);
    if (!info.success || !info.info) {
      notification.error({ message: info.error ? t(info.error) : t("gameSelector.deleteError") });
      return;
    }
    const { sessions, messages, documents } = info.info;
    const game = games.find((g) => g.id === id);
    modal.confirm({
      title: t("gameSelector.deleteConfirm"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p>{t("gameSelector.deleteWarn")}</p>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>
            <div>{t("gameSelector.sessionsLabel")}: <strong>{sessions}</strong></div>
            <div>{t("gameSelector.messagesLabel")}: <strong>{messages}</strong></div>
            <div>{t("gameSelector.documentsLabel")}: <strong>{documents}</strong></div>
          </div>
          {game?.isCurrent && (
            <p style={{ color: "#ff4d4f", margin: 0 }}>{t("gameSelector.currentGameWarning")}</p>
          )}
        </div>
      ),
      okText: t("gameSelector.deleteOk"),
      cancelText: t("gameSelector.cancel"),
      okButtonProps: { danger: true },
      mask: { closable: true },
      onOk: () => {
        deleteMutation.mutate(id, { onSuccess: () => { onGameChanged(); notification.success({ message: t("gameSelector.deleted") }); } });
      },
    });
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
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
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
