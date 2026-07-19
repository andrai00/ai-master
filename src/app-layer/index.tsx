"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme, App } from "antd";
import ruRU from "antd/locale/ru_RU";
import { FC, ReactNode, Suspense } from "react";
import { queryClient } from "./providers/query-provider";

const Providers: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#a0a0a0",
          colorPrimaryBg: "#2a2a2a",
          colorBgContainer: "#1e1e1e",
          colorBgElevated: "#242424",
          colorBgLayout: "#1b1b1b",
          colorBorder: "#2d2d2d",
          colorBorderSecondary: "#333333",
          colorText: "#d4d4d4",
          colorTextSecondary: "#999999",
          colorTextTertiary: "#666666",
          borderRadius: 4,
          borderRadiusLG: 6,
          fontSize: 13,
          fontSizeLG: 14,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          controlHeight: 30,
          lineHeight: 1.5,
          paddingXS: 8,
          paddingSM: 12,
          marginXS: 4,
          marginSM: 8,
        },
        components: {
          Tree: {
            directoryNodeSelectedBg: "#2d2d2d",
            directoryNodeSelectedColor: "#e0e0e0",
            nodeSelectedBg: "#2d2d2d",
            nodeHoverBg: "#262626",
            indentSize: 16,
            titleHeight: 28,
            colorBgContainer: "transparent",
            borderRadius: 4,
          },
          Tabs: {
            cardBg: "#1e1e1e",
            itemSelectedColor: "#e0e0e0",
            itemHoverColor: "#b0b0b0",
            itemColor: "#888888",
            cardPadding: "8px 14px",
            titleFontSize: 13,
            horizontalItemGutter: 4,
          },
          Layout: {
            siderBg: "#1e1e1e",
            bodyBg: "#1b1b1b",
            headerBg: "#1e1e1e",
            triggerBg: "#1e1e1e",
            triggerColor: "#999999",
          },
          Button: {
            defaultBg: "#2a2a2a",
            defaultBorderColor: "#333333",
            defaultHoverBg: "#333333",
            defaultHoverBorderColor: "#444444",
            defaultActiveBg: "#252525",
            colorText: "#d4d4d4",
          },
          Avatar: {
            containerSize: 28,
          },
        },
      }}
    >
      <App>
        <Suspense fallback={<div style={{ color: "#999", padding: 32 }}>Loading...</div>}>
          {children}
        </Suspense>
      </App>
    </ConfigProvider>
  </QueryClientProvider>
);

export default Providers;
