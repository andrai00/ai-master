"use client";

import { Avatar } from "antd";
import { UserOutlined, CrownOutlined } from "@ant-design/icons";
import { useUserAvatar } from "@/src/shared/api/profile/use-user-avatar";

export function UserAvatarCell({ userId, role }: { userId: string; role: string }) {
  const { data: avatarUri } = useUserAvatar(userId);

  return (
    <Avatar
      size={32}
      src={avatarUri || undefined}
      icon={role === "admin" ? <CrownOutlined /> : <UserOutlined />}
    />
  );
}
