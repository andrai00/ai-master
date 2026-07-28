"use client";

import { Layout } from "antd";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/src/widgets/sidebar";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MobileMenuProvider } from "@/src/shared/ui/page-header";
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
    const check = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource("/api/game-events");
    eventSource.onmessage = (e) => {
      let type: string = e.data;
      let payload: { sessionId?: string } | undefined;
      try {
        const parsed = JSON.parse(e.data);
        type = parsed.type ?? e.data;
        payload = parsed.payload;
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
      if (type === "game_switched") {
        queryClient.invalidateQueries();
        router.refresh();
      }
      if (type === "builder_message_deleted" || type === "builder_message_sent") {
        if (payload?.sessionId) {
          queryClient.invalidateQueries({ queryKey: ["builder", "messages", payload.sessionId] });
        }
      }
      if (type === "file_uploaded" || type === "file_removed") {
        queryClient.invalidateQueries({ queryKey: ["builder", "fileProgress"] });
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <MobileMenuProvider isMobile={isMobile && !mobileOpen} toggle={toggleSidebar}>
          {children}
        </MobileMenuProvider>
      </Content>
    </Layout>
  );
};
