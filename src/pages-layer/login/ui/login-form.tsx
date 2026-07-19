"use client";

import { Button, Input, App } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loginAction } from "@/src/shared/actions/auth/login";
import { useRouter } from "next/navigation";
import styles from "./login-form.module.css";

export const LoginForm = () => {
  const { t } = useTranslation();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { notification } = App.useApp();

  const handleSubmit = async () => {
    setLoading(true);
    const result = await loginAction(login, password);
    setLoading(false);

    if (result.success) {
      router.push("/");
      router.refresh();
    } else {
      notification.error({ title: result.error || t("auth.loginError") });
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.loginTitle")}</h1>
        <p className={styles.subtitle}>{t("auth.loginSubtitle")}</p>
        <div className={styles.fields}>
          <Input
            placeholder={t("auth.loginPlaceholder")}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            onPressEnter={handleSubmit}
            className={styles.input}
          />
          <Input.Password
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={handleSubmit}
            className={styles.input}
          />
          <Button
            type="primary"
            block
            loading={loading}
            onClick={handleSubmit}
            className={styles.btn}
          >
            {t("auth.login")}
          </Button>
        </div>
      </div>
    </div>
  );
};
