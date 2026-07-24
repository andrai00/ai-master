"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAiConfigAction, saveAiConfigAction } from "@/src/shared/actions/admin/ai-config";
import { useTranslation } from "react-i18next";
import { App } from "antd";
import type { IAiConfig } from "@/src/shared/actions/admin/ai-config";

export function useAiConfig() {
  return useQuery({
    queryKey: ["admin", "aiConfig"],
    queryFn: getAiConfigAction,
  });
}

export function useSaveAiConfig() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: (payload: IAiConfig) => saveAiConfigAction(payload),
    onSuccess: (result) => {
      if (result.success) {
        notification.success({ title: t("aiSettings.saved") });
        qc.invalidateQueries({ queryKey: ["admin", "aiConfig"] });
      }
    },
  });
}
