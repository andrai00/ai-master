"use client";

import { Table, Button, Modal, Input, App, Avatar, Popconfirm, Select, Space } from "antd";
import { UserAddOutlined, UserOutlined, CrownOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import {
  listUsersAction,
  type IUserListItem,
} from "@/src/shared/actions/admin/list-users";
import { createPlayerAction } from "@/src/shared/actions/admin/create-player";
import { editUserAction } from "@/src/shared/actions/admin/edit-user";
import { deleteUserAction } from "@/src/shared/actions/admin/delete-user";
import type { ColumnsType } from "antd/es/table";

export const UsersTable = () => {
  const { notification } = App.useApp();
  const [users, setUsers] = useState<IUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<IUserListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPw, setEditPw] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editing, setEditing] = useState(false);

  const load = () => listUsersAction().then(setUsers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openEdit = (user: IUserListItem) => {
    setEditUser(user);
    setEditName(user.displayName || user.login);
    setEditPw("");
    setEditRole(user.role);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setEditing(true);
    const result = await editUserAction(editUser.id, {
      displayName: editName,
      password: editPw || undefined,
      role: editRole !== editUser.role ? editRole : undefined,
    });
    setEditing(false);
    if (result.success) {
      notification.success({ title: "Пользователь обновлён" });
      setEditOpen(false);
      load();
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleDelete = async (user: IUserListItem) => {
    const result = await deleteUserAction(user.id);
    if (result.success) {
      notification.success({ title: "Пользователь удалён" });
      load();
    } else {
      notification.error({ title: result.error });
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    const result = await createPlayerAction(newLogin, newPassword);
    setCreating(false);
    if (result.success) {
      notification.success({ title: "Игрок создан" });
      setNewLogin("");
      setNewPassword("");
      setCreateOpen(false);
      load();
    } else {
      notification.error({ title: result.error });
    }
  };

  const columns: ColumnsType<IUserListItem> = [
    {
      title: "", key: "avatar", width: 48, responsive: ["md"],
      render: (_: unknown, record) => (
        <Avatar
          size={32}
          src={`/api/avatar/${record.id}`}
          icon={record.role === "admin" ? <CrownOutlined /> : <UserOutlined />}
        />
      ),
    },
    { title: "Логин", dataIndex: "login", key: "login" },
    { title: "Имя", dataIndex: "displayName", key: "displayName", responsive: ["md"] },
    {
      title: "Роль", dataIndex: "role", key: "role",
      render: (role: string) => role === "admin" ? "Администратор" : "Игрок",
    },
    {
      title: "Создан", dataIndex: "createdAt", key: "createdAt", responsive: ["lg"],
      render: (d: Date) => new Date(d).toLocaleDateString(),
    },
    {
      title: "", key: "actions", width: 80,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          {record.role !== "admin" && (
            <Popconfirm
              title="Удалить пользователя?"
              onConfirm={() => handleDelete(record)}
              okText="Да"
              cancelText="Нет"
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div
      style={{
        width: "100%", maxWidth: 760, margin: "0 auto",
        padding: "24px 16px", height: "100%", overflow: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--text-primary)" }}>Пользователи</h2>
        <Button icon={<UserAddOutlined />} onClick={() => setCreateOpen(true)}>
          Добавить игрока
        </Button>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "Нет пользователей" }}
      />

      <Modal
        title="Добавить игрока"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Создать"
        cancelText="Отмена"
        centered
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input placeholder="Логин" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
          <Input.Password placeholder="Пароль" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
      </Modal>

      <Modal
        title="Редактировать пользователя"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEdit}
        confirmLoading={editing}
        okText="Сохранить"
        cancelText="Отмена"
        centered
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>Имя</div>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>Новый пароль (оставьте пустым чтобы не менять)</div>
            <Input.Password value={editPw} onChange={(e) => setEditPw(e.target.value)} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#999" }}>Роль</div>
            <Select
              value={editRole}
              onChange={setEditRole}
              style={{ width: "100%" }}
              options={[
                { value: "admin", label: "Администратор" },
                { value: "player", label: "Игрок" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
