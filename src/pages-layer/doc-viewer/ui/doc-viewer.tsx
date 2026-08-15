"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { MdViewer } from "@/src/features/md-viewer";
import { useTranslation } from "react-i18next";
import styles from "./page.module.css";

interface IDocViewerProps {
  title: string;
  content: string;
  backTo?: string;
}

export const DocViewer = ({ title, content, backTo = "/" }: IDocViewerProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push(backTo)}>
          <ArrowLeftOutlined /> {t("chat.backToChat")}
        </button>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <div className={styles.content}>
        <MdViewer content={content} showToc />
      </div>
    </div>
  );
};
