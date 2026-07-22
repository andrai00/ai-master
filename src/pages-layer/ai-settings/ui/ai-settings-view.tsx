"use client";

import { Select, Input, Button, App } from "antd";
import {
  CloudOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  SaveOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAiConfigAction, saveAiConfigAction } from "@/src/shared/actions/admin/ai-config";
import { useState, useEffect } from "react";

const PROVIDERS = [
  {
    value: "openrouter",
    label: "OpenRouter",
    icon: <CloudOutlined />,
    defaultUrl: "https://openrouter.ai/api/v1",
    modelHint: "openai/gpt-4o, anthropic/claude-3-opus",
  },
  {
    value: "openai",
    label: "OpenAI",
    icon: <RobotOutlined />,
    defaultUrl: "https://api.openai.com/v1",
    modelHint: "gpt-4o, gpt-4o-mini, o3-mini",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    icon: <ApiOutlined />,
    defaultUrl: "https://api.anthropic.com/v1",
    modelHint: "claude-3-5-sonnet-20240620, claude-3-opus-20240229",
  },
  {
    value: "groq",
    label: "Groq",
    icon: <ThunderboltOutlined />,
    defaultUrl: "https://api.groq.com/openai/v1",
    modelHint: "llama-3.1-70b-versatile, mixtral-8x7b-32768",
  },
  {
    value: "ollama",
    label: "Ollama (local)",
    icon: <SettingOutlined />,
    defaultUrl: "http://localhost:11434/v1",
    modelHint: "llama3:latest, mistral:latest, gemma2:latest",
  },
  {
    value: "custom",
    label: "Custom API",
    icon: <ApiOutlined />,
    defaultUrl: "",
    modelHint: "any-model-id",
  },
];

function getProvider(v: string) {
  return PROVIDERS.find((p) => p.value === v) || PROVIDERS[0];
}

export const AiSettingsView = () => {
  const { t } = useTranslation();
  const { notification } = App.useApp();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin", "aiConfig"],
    queryFn: getAiConfigAction,
  });

  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setApiKey(config.apiKey);
      setModel(config.model);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAiConfigAction({
        provider,
        baseUrl,
        apiKey,
        model,
      }),
    onSuccess: (result) => {
      if (result.success) {
        notification.success({ title: t("aiSettings.saved") });
        qc.invalidateQueries({ queryKey: ["admin", "aiConfig"] });
      }
    },
  });

  const currentProvider = getProvider(provider);

  const handleProviderChange = (v: string) => {
    setProvider(v);
    const p = getProvider(v);
    if (p.defaultUrl) setBaseUrl(p.defaultUrl);
  };

  return (
    <div
      style={{
        padding: 24,
        width: 440,
        margin: "0 auto",
        height: "100%",
        overflow: "auto",
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 20,
          color: "var(--text-primary)",
        }}
      >
        <SettingOutlined style={{ marginRight: 8 }} />
        {t("aiSettings.title")}
      </h2>

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
                  {p.icon} {p.label}
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
            placeholder={currentProvider.defaultUrl || "https://..."}
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
            placeholder="sk-or-..."
          />
        </div>

        {/* Model */}
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
            {t("aiSettings.model")}
          </div>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={currentProvider.modelHint}
          />
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)", wordBreak: "break-word" }}>
            {currentProvider.modelHint}
          </div>
        </div>

        {/* Save */}
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          block
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
};
