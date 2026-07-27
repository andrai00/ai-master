"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Button } from "antd";
import { MenuOutlined } from "@ant-design/icons";

const MobileMenuCtx = createContext<{ toggle: () => void; isMobile: boolean }>({
  toggle: () => {},
  isMobile: false,
});

export function MobileMenuProvider({
  isMobile,
  toggle,
  children,
}: {
  isMobile: boolean;
  toggle: () => void;
  children: ReactNode;
}) {
  return (
    <MobileMenuCtx.Provider value={{ toggle, isMobile }}>
      {children}
    </MobileMenuCtx.Provider>
  );
}

export function useMobileMenu() {
  return useContext(MobileMenuCtx);
}

interface IPageHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: IPageHeaderProps) {
  const { toggle, isMobile } = useMobileMenu();

  return (
    <div className="pageHeader">
      {isMobile && (
        <Button
          type="text"
          size="small"
          icon={<MenuOutlined />}
          onClick={toggle}
          className="pageHeaderMenuBtn"
        />
      )}
      <h2 className="pageHeaderTitle">{title}</h2>
      {actions && <div className="pageHeaderActions">{actions}</div>}
    </div>
  );
}
