"use client";

import { Button, Input, notification } from "antd";
import { useState } from "react";
import { loginAction } from "@/src/shared/actions/auth/login";
import { useRouter } from "next/navigation";
import styles from "./login-form.module.css";

export const LoginForm = () => {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    setLoading(true);
    const result = await loginAction(login, password);
    setLoading(false);

    if (result.success) {
      router.push("/sessions");
      router.refresh();
    } else {
      notification.error({ message: result.error });
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>ai-master</h1>
        <p className={styles.subtitle}>Вход в игру</p>
        <div className={styles.fields}>
          <Input
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            onPressEnter={handleSubmit}
            className={styles.input}
          />
          <Input.Password
            placeholder="Пароль"
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
            Войти
          </Button>
        </div>
      </div>
    </div>
  );
};
