"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme, App } from "antd";
import ruRU from "antd/locale/ru_RU";
import { FC, ReactNode, Suspense, useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { queryClient } from "./providers/query-provider";
import { ThemeContext, getInitialTheme, saveTheme, type TThemeMode } from "@/src/shared/lib/theme";
import "@/src/shared/config/i18n";

const darkTokens = {
  colorPrimary: "#5a5a5a",
  colorPrimaryHover: "#6e6e6e",
  colorPrimaryActive: "#4a4a4a",
  colorPrimaryBg: "#2a2a2a",
  colorBgContainer: "#1e1e1e",
  colorBgElevated: "#242424",
  colorBgLayout: "#1b1b1b",
  colorBorder: "#2d2d2d",
  colorBorderSecondary: "#333333",
  colorText: "#d4d4d4",
  colorTextSecondary: "#999999",
  colorTextTertiary: "#666666",
};

const lightTokens = {
  colorPrimary: "#3a3a3a",
  colorPrimaryHover: "#4a4a4a",
  colorPrimaryActive: "#555555",
  colorPrimaryBg: "#f0f0f0",
  colorBgContainer: "#ffffff",
  colorBgElevated: "#ffffff",
  colorBgLayout: "#f5f5f5",
  colorBorder: "#e0e0e0",
  colorBorderSecondary: "#eeeeee",
  colorText: "#1a1a1a",
  colorTextSecondary: "#666666",
  colorTextTertiary: "#999999",
};

const sharedTokens = {
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
};

const baseComponents = {
  Tree: { indentSize: 16, titleHeight: 28, borderRadius: 4 },
  Tabs: { cardPadding: "8px 14px", titleFontSize: 13, horizontalItemGutter: 4 },
  Avatar: { containerSize: 28 },
};

const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<TThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const theme = getInitialTheme();
    setMode(theme);
    document.documentElement.setAttribute("data-theme", theme);
    setReady(true);
  }, []);

  const handleSetMode = (newMode: TThemeMode) => {
    setMode(newMode);
    saveTheme(newMode);
    document.documentElement.setAttribute("data-theme", newMode);
  };

  const themeConfig = useMemo(() => {
    const isDark = mode === "dark";
    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { ...sharedTokens, ...(isDark ? darkTokens : lightTokens) },
      components: {
        ...baseComponents,
        Tree: {
          ...baseComponents.Tree,
          directoryNodeSelectedBg: isDark ? "#2d2d2d" : "#e8e8e8",
          directoryNodeSelectedColor: isDark ? "#e0e0e0" : "#1a1a1a",
          nodeSelectedBg: isDark ? "#2d2d2d" : "#e8e8e8",
          nodeHoverBg: isDark ? "#262626" : "#f0f0f0",
          colorBgContainer: "transparent",
        },
        Tabs: {
          ...baseComponents.Tabs,
          cardBg: isDark ? "#1e1e1e" : "#ffffff",
          itemSelectedColor: isDark ? "#e0e0e0" : "#1a1a1a",
          itemHoverColor: isDark ? "#b0b0b0" : "#555555",
          itemColor: isDark ? "#888888" : "#777777",
        },
        Layout: {
          siderBg: isDark ? "#1e1e1e" : "#fafafa",
          bodyBg: isDark ? "#1b1b1b" : "#f5f5f5",
          headerBg: isDark ? "#1e1e1e" : "#ffffff",
          triggerBg: isDark ? "#1e1e1e" : "#fafafa",
          triggerColor: isDark ? "#999999" : "#777777",
        },
        Button: {
          defaultBg: isDark ? "#2a2a2a" : "#ffffff",
          defaultBorderColor: isDark ? "#333333" : "#d9d9d9",
          defaultHoverBg: isDark ? "#333333" : "#f5f5f5",
          defaultHoverBorderColor: isDark ? "#444444" : "#d9d9d9",
          defaultActiveBg: isDark ? "#252525" : "#eeeeee",
          colorText: isDark ? "#d4d4d4" : "#333333",
        },
      },
    };
  }, [mode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={ruRU} theme={themeConfig}>
        <App>
          <Suspense fallback={<LoadingFallback />}>
            {ready && (
              <ThemeContext.Provider value={{ mode, setMode: handleSetMode }}>
                {children}
              </ThemeContext.Provider>
            )}
          </Suspense>
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default Providers;

const LoadingFallback = () => {
  const { t } = useTranslation();
  return <div style={{ color: "var(--text-secondary)", padding: 32 }}>{t("common.loading")}</div>;
};
