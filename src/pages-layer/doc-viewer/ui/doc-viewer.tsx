"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { MdViewer } from "@/src/features/md-viewer";
import { useTranslation } from "react-i18next";
import { useDocumentPreview } from "@/src/shared/ui/document-preview-provider";
import styles from "./doc-viewer.module.css";

interface IDocViewerProps {
  title: string;
  content: string;
  backTo?: string;
}

export const DocViewer = ({ title, content, backTo = "/" }: IDocViewerProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { openDocument } = useDocumentPreview();

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push(backTo)}>
          <ArrowLeftOutlined /> {t("chat.backToChat")}
        </button>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <div className={styles.content}>
        <MdViewer
          content={content}
          showToc
          onNavigate={(docId, anchor) => openDocument(docId, anchor)}
        />
      </div>
    </div>
  );
};
