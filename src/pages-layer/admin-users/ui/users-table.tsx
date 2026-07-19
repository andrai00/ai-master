"use client";

import { Table, Button, Modal, Input, App, Avatar } from "antd";
import { UserAddOutlined, UserOutlined, CrownOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  listUsersAction,
  type IUserListItem,
} from "@/src/shared/actions/admin/list-users";
import { createPlayerAction } from "@/src/shared/actions/admin/create-player";
import type { ColumnsType } from "antd/es/table";

export const UsersTable = () => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const [users, setUsers] = useState<IUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listUsersAction().then(setUsers).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    const result = await createPlayerAction(newLogin, newPassword);
    setCreating(false);
    if (result.success) {
      notification.success({ title: "Игрок создан" });
      setNewLogin("");
      setNewPassword("");
      setModalOpen(false);
      listUsersAction().then(setUsers);
    } else {
      notification.error({ title: result.error });
    }
  };

  const columns: ColumnsType<IUserListItem> = [
    {
      title: "",
      key: "avatar",
      width: 48,
      responsive: ["md"],
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
      title: "Роль",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (role === "admin" ? "Администратор" : "Игрок"),
    },
    {
      title: "Создан",
      dataIndex: "createdAt",
      key: "createdAt",
      responsive: ["lg"],
      render: (d: Date) => new Date(d).toLocaleDateString(),
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 760,
        margin: "0 auto",
        padding: "24px 16px",
        height: "100%",
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--text-primary)" }}>Пользователи</h2>
        <Button icon={<UserAddOutlined />} onClick={() => setModalOpen(true)}>
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
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
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
    </div>
  );
};
