"use client";

import { Select, Input, Button, App, Spin } from "antd";
import {
  CloudOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  SaveOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAiConfig, useSaveAiConfig } from "@/src/shared/api/admin/useAiConfig";
import { useModelList } from "@/src/shared/api/admin/useModelList";
import { useTestAiConnection } from "@/src/shared/api/admin/useTestAiConnection";
import type { IAiConfig } from "@/src/shared/actions/admin/manage-ai-config";
import { VirtualSelect } from "@/src/features/virtual-select";
import { PageHeader } from "@/src/shared/ui/page-header";

const PROVIDERS = [
  {
    value: "openrouter",
    labelKey: "aiSettings.providerOpenRouter",
    icon: <CloudOutlined />,
    defaultUrl: "https://openrouter.ai/api/v1",
    modelHint: "openai/gpt-4o, anthropic/claude-3-opus",
  },
  {
    value: "openai",
    labelKey: "aiSettings.providerOpenAI",
    icon: <RobotOutlined />,
    defaultUrl: "https://api.openai.com/v1",
    modelHint: "gpt-4o, gpt-4o-mini, o3-mini",
  },
  {
    value: "anthropic",
    labelKey: "aiSettings.providerAnthropic",
    icon: <ApiOutlined />,
    defaultUrl: "https://api.anthropic.com/v1",
    modelHint: "claude-3-5-sonnet-20240620, claude-3-opus-20240229",
  },
  {
    value: "groq",
    labelKey: "aiSettings.providerGroq",
    icon: <ThunderboltOutlined />,
    defaultUrl: "https://api.groq.com/openai/v1",
    modelHint: "llama-3.1-70b-versatile, mixtral-8x7b-32768",
  },
  {
    value: "ollama",
    labelKey: "aiSettings.providerOllama",
    icon: <SettingOutlined />,
    defaultUrl: "http://localhost:11434/v1",
    modelHint: "llama3:latest, mistral:latest, gemma2:latest",
  },
  {
    value: "custom",
    labelKey: "aiSettings.providerCustom",
    icon: <ApiOutlined />,
    defaultUrl: "",
    modelHint: "any-model-id",
  },
];

const PROVIDER_LIMITS: Record<string, number> = {
  deepseek: 128000,
  openai: 128000,
  openrouter: 128000,
  groq: 128000,
  ollama: 8192,
  anthropic: 200000,
  custom: 128000,
};

function getProvider(v: string) {
  return PROVIDERS.find((p) => p.value === v) || PROVIDERS[0];
}

export const AiSettingsView = () => {
  const { t } = useTranslation();
  const { data: config } = useAiConfig();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={t("aiSettings.title")} />
      <div
        style={{
          padding: 24,
          width: 440,
          maxWidth: "100%",
          margin: "0 auto",
          overflow: "auto",
          flex: 1,
        }}
      >
        {config ? (
          <AiConfigForm key="ready" config={config} />
        ) : (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Spin />
          </div>
        )}
      </div>
    </div>
  );
};

function AiConfigForm({ config }: { config: IAiConfig }) {
  const { t } = useTranslation();
  const { notification } = App.useApp();

  const [provider, setProvider] = useState(config.provider);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [contextLimit, setContextLimit] = useState<string>(
    config.contextLimit > 0 ? String(config.contextLimit) : ""
  );
  const [modelsOpen, setModelsOpen] = useState(false);

  const contextDefault = PROVIDER_LIMITS[provider] ?? 128000;

  const saveMutation = useSaveAiConfig();
  const testMutation = useTestAiConnection();

  const currentProvider = getProvider(provider);

  const handleProviderChange = (v: string) => {
    setProvider(v);
    const p = getProvider(v);
    if (p.defaultUrl) setBaseUrl(p.defaultUrl);
  };

  const { data: modelsData, isFetching: modelsLoading } = useModelList(
    provider, baseUrl, apiKey, modelsOpen
  );

  const modelList = modelsData?.success ? modelsData.models || [] : [];

  const handleTest = () => {
    testMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          notification.success({ title: t("aiSettings.testOk"), description: res.message });
        } else {
          notification.error({ title: t("aiSettings.testFail"), description: res.message });
        }
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Provider */}
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("aiSettings.provider")}
        </div>
        <Select
          value={provider}
          onChange={handleProviderChange}
          options={PROVIDERS.map((p) => ({
            value: p.value,
            label: (
              <span>
                {p.icon} {t(p.labelKey)}
              </span>
            ),
          }))}
          style={{ width: "100%" }}
        />
      </div>

      {/* Base URL */}
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("aiSettings.baseUrl")}
        </div>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={currentProvider.defaultUrl || t("aiSettings.urlPlaceholder")}
        />
      </div>

      {/* API Key */}
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("aiSettings.apiKey")}
        </div>
        <Input.Password
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("aiSettings.keyPlaceholder")}
        />
      </div>

      {/* Model */}
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("aiSettings.model")}
        </div>
        <VirtualSelect
          value={model || undefined}
          onChange={setModel}
          showSearch
          allowClear
          placeholder={modelsLoading ? t("aiSettings.loading") : currentProvider.modelHint}
          style={{ width: "100%" }}
          options={modelList.map((m) => ({ value: m, label: m }))}
          loading={modelsLoading}
          onOpenChange={(open) => setModelsOpen(open)}
          notFoundContent={modelsLoading ? t("aiSettings.loading") : apiKey ? t("aiSettings.noModels") : t("aiSettings.enterKey")}
        />
      </div>

      {/* Context Limit */}
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("aiSettings.contextLimit")}
        </div>
        <Input
          value={contextLimit}
          onChange={(e) => setContextLimit(e.target.value.replace(/\D/g, ""))}
          placeholder={contextDefault ? t("aiSettings.contextLimitAuto", { count: contextDefault.toLocaleString("ru") }) : t("aiSettings.contextLimitHint")}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          onClick={handleTest}
          loading={testMutation.isPending}
          icon={<ApiOutlined />}
          style={{ flex: 1 }}
        >
          {t("aiSettings.test")}
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => saveMutation.mutate({ provider, baseUrl, apiKey, model, contextLimit: parseInt(contextLimit, 10) || 0, extra: "" })}
          loading={saveMutation.isPending}
          style={{ flex: 1 }}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
