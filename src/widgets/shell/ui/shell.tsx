"use client";

import { Layout } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/src/widgets/sidebar";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { ISessionPayload } from "@/src/shared/lib/auth/session";
import styles from "./shell.module.css";

const { Content } = Layout;
const MOBILE_BREAKPOINT = 768;

interface IShellProps {
  user?: ISessionPayload;
  children: ReactNode;
}

export const Shell = ({ user, children }: IShellProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const eventSource = new EventSource("/api/game-events");
    eventSource.onmessage = (e) => {
      let type = e.data;
      try {
        const parsed = JSON.parse(e.data);
        type = parsed.type ?? e.data;
      } catch { /* legacy format — data is the event type string */ }

      if (type === "kick") {
        eventSource.close();
        window.location.href = "/api/logout?redirect=/login";
      }
      if (type === "mode_switch") {
        router.refresh();
      }
      if (type === "builder_mode_change") {
        queryClient.invalidateQueries({ queryKey: ["builderMode"] });
      }
      if (type === "game_deleted") {
        queryClient.invalidateQueries();
        router.refresh();
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
  }, [router]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  }, [isMobile]);

  return (
    <Layout className={styles.shell}>
      {isMobile && mobileOpen && (
        <div className={styles.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {isMobile ? (
        <div className={`${styles.mobileDrawer} ${mobileOpen ? styles.mobileDrawerOpen : ""}`}>
          <Sidebar collapsed={false} onToggle={toggleSidebar} user={user} onGameChange={() => router.refresh()} />
        </div>
      ) : (
        <Layout.Sider
          collapsed={sidebarCollapsed}
          collapsedWidth={48}
          width={266}
          className={styles.sider}
          trigger={null}
        >
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} user={user} onGameChange={() => router.refresh()} />
        </Layout.Sider>
      )}

      <Content className={styles.content}>
        {isMobile && !mobileOpen && (
          <button className={styles.mobileMenuBtn} onClick={toggleSidebar}>
            <MenuOutlined />
          </button>
        )}
        {children}
      </Content>
    </Layout>
  );
};
