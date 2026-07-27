"use client";

import { Modal, Button, Tooltip } from "antd";
import { CloseOutlined, FileOutlined, FileTextOutlined, CaretRightOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "./chat-panel.module.css";

export interface IFileProgress {
  fileId: string;
  filename: string;
  totalSize: number;
  readOffset: number;
  onRemove?: () => void;
}

interface IFileProgressModalProps {
  open: boolean;
  files: IFileProgress[];
  processing?: boolean;
  onClose: () => void;
  onContinue?: () => void;
}

function getChunks(size: number): number {
  return Math.ceil(size / 5000);
}

function truncateName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name.length > 24 ? name.slice(0, 22) + "\u2026" : name;
  const ext = name.slice(dot);
  const base = name.slice(0, dot);
  if (name.length <= 28) return name;
  return base.slice(0, 20) + "\u2026" + ext;
}

function getStatus(
  readOffset: number,
  totalSize: number,
  t: (key: string) => string
): { label: string; className: string } {
  if (totalSize <= 0) return { label: t("chat.fileStatusWaiting"), className: styles.statusWaiting };
  if (readOffset >= totalSize) return { label: t("chat.fileStatusDone"), className: styles.statusDone };
  if (readOffset > 0) return { label: t("chat.fileStatusProcessing"), className: styles.statusProcessing };
  return { label: t("chat.fileStatusWaiting"), className: styles.statusWaiting };
}

export const FileProgressModal = ({ open, files, processing, onClose, onContinue }: IFileProgressModalProps) => {
  const { t } = useTranslation();
  const allDone = files.length > 0 && files.every((f) => f.readOffset >= f.totalSize && f.totalSize > 0);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={480}
      footer={null}
      title={<span style={{ fontSize: 13, fontWeight: 600 }}>{t("chat.fileProcessingTitle")}</span>}
      className={styles.fileModal}
    >
      <div className={styles.modalContent}>
        {files.map((f) => {
          const totalChunks = getChunks(f.totalSize);
          const readChunks = f.readOffset > 0 ? Math.min(getChunks(f.readOffset), totalChunks) : 0;
          const pct = f.totalSize > 0 ? Math.min(Math.round((f.readOffset / f.totalSize) * 100), 100) : 0;
          const status = getStatus(f.readOffset, f.totalSize, t);

          return (
            <div key={f.fileId} className={styles.modalFile}>
              <div className={styles.modalFileHeader}>
                <div className={styles.modalFileInfo}>
                  <FileOutlined style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }} />
                  <span className={styles.modalFileName}>{truncateName(f.filename)}</span>
                  <span className={styles.modalFileChunks}>
                    <FileTextOutlined style={{ fontSize: 11 }} />
                    {readChunks}/{totalChunks}
                  </span>
                </div>
                <div className={styles.modalFileRight}>
                  <span className={`${styles.modalFileStatus} ${status.className}`}>{status.label}</span>
                  {f.onRemove && !processing && (
                    <Tooltip title={t("chat.removeFile")}>
                      <Button
                        type="text"
                        size="small"
                        className={styles.modalRemoveBtn}
                        icon={<CloseOutlined style={{ fontSize: 10 }} />}
                        onClick={f.onRemove}
                      />
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className={styles.modalProgressTrack}>
                <span
                  className={`${styles.modalProgressFill} ${pct >= 100 ? styles.progressDone : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {onContinue && !allDone && !processing && (
          <button className={styles.modalContinueBtn} onClick={() => { onContinue(); onClose(); }}>
            <CaretRightOutlined style={{ fontSize: 14 }} />
            <span>{t("chat.continueReading")}</span>
          </button>
        )}
      </div>
    </Modal>
  );
};
