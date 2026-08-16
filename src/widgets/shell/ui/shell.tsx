"use client";

import { Layout } from "antd";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/src/widgets/sidebar";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MobileMenuProvider } from "@/src/shared/ui/page-header";
import { DocumentPreviewProvider } from "@/src/shared/ui/document-preview-provider";
import { emitStep, emitReconnect, emitDocumentDeleted } from "@/src/shared/lib/realtime/client";
import type { IRealtimeStepEvent } from "@/src/shared/lib/realtime/client";
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
    let mounted = true;

    const es = new EventSource("/api/stream");

    es.onopen = () => {
      if (!mounted) return;
      emitReconnect();
      queryClient.invalidateQueries({ queryKey: ["game", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["personal", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["builder", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["game", "rolls"] });
      queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
      queryClient.invalidateQueries({ queryKey: ["game", "responseState"] });
    };

    es.onmessage = (e) => {
        let type = "";
        let payload: { sessionId?: string; documentId?: string } | undefined;
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.ns === "steps") {
            if (parsed.sessionId) emitStep(parsed.sessionId, parsed as IRealtimeStepEvent);
            return;
          }
          type = parsed.type ?? "";
          payload = parsed.payload;
        } catch { return; }

        if (type === "kick") {
          es.close();
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
        if (type === "builder_message_deleted" || type === "builder_message_sent" || type === "builder_chat_cleared") {
          if (payload?.sessionId) {
            queryClient.invalidateQueries({ queryKey: ["builder", "messages", payload.sessionId] });
          }
        }
        if (type === "file_uploaded" || type === "file_removed" || type === "archive_uploaded") {
          queryClient.invalidateQueries({ queryKey: ["builder", "messages"] });
        }
        if (type === "game_created" || type === "game_updated" || type === "game_deleted") {
          queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "currentGame"] });
        }
        if (type === "user_created" || type === "user_updated" || type === "user_deleted") {
          queryClient.invalidateQueries({ queryKey: ["admin", "players"] });
        }
        if (type === "ai_config_updated") {
          queryClient.invalidateQueries({ queryKey: ["admin", "aiConfig"] });
        }
        if (type === "game_message_sent" || type === "game_message_deleted") {
          queryClient.invalidateQueries({ queryKey: ["game", "messages"] });
        }
        if (type === "personal_message_sent" || type === "personal_message_deleted") {
          queryClient.invalidateQueries({ queryKey: ["personal", "messages"] });
        }
        if (type === "profile_updated") {
          queryClient.invalidateQueries({ queryKey: ["avatar"] });
          queryClient.invalidateQueries({ queryKey: ["profile", "avatar"] });
        }
        if (type === "gm_response_requested" || type === "gm_response_stopped") {
          queryClient.invalidateQueries({ queryKey: ["game", "responseState"] });
        }
        if (type === "roll_assigned" || type === "roll_completed" || type === "roll_removed") {
          queryClient.invalidateQueries({ queryKey: ["game", "rolls"] });
          queryClient.invalidateQueries({ queryKey: ["personal", "rolls"] });
        }
        if (type === "document_created" || type === "document_updated") {
          queryClient.invalidateQueries({ queryKey: ["game", "playerDocuments"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
        }
        if (type === "document_deleted") {
          queryClient.invalidateQueries({ queryKey: ["game", "playerDocuments"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
          if (payload?.documentId) emitDocumentDeleted(payload.documentId);
        }
      };

    es.onerror = () => {
      // EventSource reconnects natively; no manual close/reconnect needed.
    };

    return () => {
      mounted = false;
      try { es?.close(); } catch { /* already closed */ }
    };
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
    <DocumentPreviewProvider>
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
    </DocumentPreviewProvider>
  );
};
