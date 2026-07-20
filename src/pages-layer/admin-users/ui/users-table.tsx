"use client";

import { Table, Button, Modal, Input, App, Avatar, Popconfirm, Select, Space, Checkbox } from "antd";
import { UserAddOutlined, UserOutlined, CrownOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useListUsers } from "@/src/shared/api/admin/use-list-users";
import { useCreatePlayer } from "@/src/shared/api/admin/use-create-player";
import { useEditUser } from "@/src/shared/api/admin/use-edit-user";
import { useDeleteUser } from "@/src/shared/api/admin/use-delete-user";
import { listGamesAction, type IGameItem } from "@/src/shared/actions/admin/games";
import { getUserGameAccessAction } from "@/src/shared/actions/admin/game-access";
import type { IUserListItem } from "@/src/shared/actions/admin/list-users";
import type { ColumnsType } from "antd/es/table";

export const UsersTable = () => {
  const { t } = useTranslation();
  const { notification } = App.useApp();

  const [createOpen, setCreateOpen] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<IUserListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPw, setEditPw] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editGameAccess, setEditGameAccess] = useState<string[]>([]);
  const [editGames, setEditGames] = useState<IGameItem[]>([]);

  const { data: users = [], isLoading } = useListUsers();
  const createMutation = useCreatePlayer();
  const editMutation = useEditUser();
  const deleteMutation = useDeleteUser();

  const openEdit = async (user: IUserListItem) => {
    setEditUser(user);
    setEditName(user.displayName || user.login);
    setEditPw("");
    setEditRole(user.role);
    const [gameList, access] = await Promise.all([listGamesAction(), getUserGameAccessAction(user.id)]);
    setEditGames(gameList);
    setEditGameAccess(access);
    setEditOpen(true);
  };

  const handleCreate = () => {
    createMutation.mutate({ login: newLogin, password: newPassword }, {
      onSuccess: (result) => {
        if (result.success) {
          notification.success({ title: t("admin.playerCreated") });
          setNewLogin(""); setNewPassword(""); setCreateOpen(false);
        }
      },
    });
  };

  const handleEdit = () => {
    if (!editUser) return;
    editMutation.mutate({
      userId: editUser.id, displayName: editName, password: editPw,
      role: editRole !== editUser.role ? editRole : undefined, gameAccess: editGameAccess,
    }, {
      onSuccess: (result) => {
        if (result.success) {
          notification.success({ title: t("admin.userUpdated") });
          setEditOpen(false);
        }
      },
    });
  };

  const handleDelete = (userId: string) => {
    deleteMutation.mutate(userId, {
      onSuccess: (result) => result.success
        ? notification.success({ title: t("admin.userDeleted") })
        : notification.error({ title: result.error }),
    });
  };

  const columns: ColumnsType<IUserListItem> = [
    { title: "", key: "avatar", width: 48, responsive: ["md"],
      render: (_: unknown, record) => <Avatar size={32} src={`/api/avatar/${record.id}`} icon={record.role === "admin" ? <CrownOutlined /> : <UserOutlined />} /> },
    { title: t("admin.userCol"), key: "user",
      render: (_: unknown, record) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 500 }}>{record.displayName || record.login}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>@{record.login} · {record.role === "admin" ? t("admin.roleAdmin") : t("admin.rolePlayer")}</div>
        </div>
      ),
    },
    { title: t("admin.gamesCol"), key: "games", responsive: ["lg"],
      render: (_: unknown, record) => (
        <Space size={4} wrap>
          {record.games.map((g) => (
            <span key={g.id} title={g.name} style={{
              display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, lineHeight: "18px",
              background: g.isCurrent ? "var(--bg-active)" : "transparent",
              border: `1px solid ${g.isCurrent ? "var(--text-dim)" : "var(--border)"}`,
              color: g.isCurrent ? "var(--text-primary)" : "var(--text-dim)",
              maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{g.name}</span>
          ))}
          {record.games.length === 0 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>}
        </Space>
      ),
    },
    { title: "", key: "actions", width: 80,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          {record.role !== "admin" && (
            <Popconfirm title={t("admin.deleteConfirm")} onConfirm={() => handleDelete(record.id)}
              okText={t("admin.yes")} cancelText={t("admin.no")}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "24px 16px", height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--text-primary)" }}>{t("admin.users")}</h2>
        <Button icon={<UserAddOutlined />} onClick={() => setCreateOpen(true)}>{t("admin.addPlayer")}</Button>
      </div>
      <Table dataSource={users} columns={columns} rowKey="id" loading={isLoading}
        pagination={false} size="middle" scroll={{ x: "max-content" }}
        locale={{ emptyText: t("admin.noUsers") }}
        onRow={(record) => ({ style: record.inCurrentGame ? undefined : { opacity: 0.45 } })} />
      <Modal title={t("admin.createPlayer")} open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={handleCreate} confirmLoading={createMutation.isPending} okText={t("admin.yes")} cancelText={t("gameSelector.cancel")} centered>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input placeholder={t("admin.loginPlaceholder")} value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
          <Input.Password placeholder={t("admin.passwordPlaceholder")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
      </Modal>
      <Modal title={t("admin.editUser")} open={editOpen} onCancel={() => setEditOpen(false)}
        onOk={handleEdit} confirmLoading={editMutation.isPending}
        okText={t("common.save")} cancelText={t("gameSelector.cancel")} centered>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div><div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("admin.nameCol")}</div><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
          <div><div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("admin.passwordHint")}</div><Input.Password value={editPw} onChange={(e) => setEditPw(e.target.value)} /></div>
          <div><div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("admin.roleCol")}</div>
            <Select value={editRole} onChange={setEditRole} style={{ width: "100%" }} options={[{ value: "admin", label: t("admin.roleAdmin") }, { value: "player", label: t("admin.rolePlayer") }]} /></div>
          <div><div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>{t("admin.gameAccess")}</div>
            {editGames.map((g) => (
              <div key={g.id} style={{ marginBottom: 4 }}>
                <Checkbox checked={editGameAccess.includes(g.id)} onChange={(e) => {
                  if (e.target.checked) setEditGameAccess([...editGameAccess, g.id]);
                  else setEditGameAccess(editGameAccess.filter((id) => id !== g.id));
                }}>{g.name}</Checkbox>
              </div>
            ))}
            {editGames.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("admin.noGames")}</div>}
          </div>
        </div>
      </Modal>
    </div>
  );
};
