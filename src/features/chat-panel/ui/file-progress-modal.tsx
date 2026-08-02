"use client";

import { useState } from "react";
import { Modal, Button, Tooltip, Input } from "antd";
import { CloseOutlined, FileOutlined, FileTextOutlined, CaretRightOutlined, EditOutlined, CheckOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "./chat-panel.module.css";

export interface IFileProgress {
  fileId: string;
  filename: string;
  totalSize: number;
  readOffset: number;
  status: "parsing" | "done" | "error";
  onRemove?: () => void;
  onSetOffset?: (chunkNumber: number) => void;
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
  status: IFileProgress["status"],
  readOffset: number,
  totalSize: number,
  t: (key: string) => string
): { label: string; className: string } {
  if (status === "error") return { label: t("chat.fileStatusError"), className: styles.statusError };
  if (status === "parsing") return { label: t("chat.fileStatusParsing"), className: styles.statusParsing };
  if (totalSize <= 0) return { label: t("chat.fileStatusWaiting"), className: styles.statusWaiting };
  if (readOffset >= totalSize) return { label: t("chat.fileStatusDone"), className: styles.statusDone };
  if (readOffset > 0) return { label: t("chat.fileStatusProcessing"), className: styles.statusProcessing };
  return { label: t("chat.fileStatusWaiting"), className: styles.statusWaiting };
}

export const FileProgressModal = ({ open, files, processing, onClose, onContinue }: IFileProgressModalProps) => {
  const { t } = useTranslation();
  const allDone = files.length > 0 && files.every((f) => f.readOffset >= f.totalSize && f.totalSize > 0);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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
          const isParsing = f.status === "parsing";
          const isError = f.status === "error";
          const totalChunks = getChunks(f.totalSize);
          const readChunks = f.readOffset > 0 ? Math.min(getChunks(f.readOffset), totalChunks) : 0;
          const pct = f.totalSize > 0 ? Math.min(Math.round((f.readOffset / f.totalSize) * 100), 100) : 0;
          const status = getStatus(f.status, f.readOffset, f.totalSize, t);

          return (
            <div key={f.fileId} className={styles.modalFile}>
              <div className={styles.modalFileHeader}>
                <div className={styles.modalFileInfo}>
                  <FileOutlined style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }} />
                  <span className={styles.modalFileName}>{truncateName(f.filename)}</span>
                  {!isParsing && !isError && f.totalSize > 0 && (
                    editingFileId === f.fileId ? (
                      <span className={styles.modalFileChunks} style={{ gap: 4 }}>
                        <FileTextOutlined style={{ fontSize: 11 }} />
                        <Input
                          size="small"
                          style={{ width: 50, fontSize: 11, height: 20, padding: "0 4px" }}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
                          onPressEnter={() => {
                            const n = parseInt(editValue, 10);
                            if (n > 0 && n <= totalChunks && f.onSetOffset) {
                              f.onSetOffset(n - 1);
                              setEditingFileId(null);
                            }
                          }}
                          placeholder={String(readChunks)}
                          autoFocus
                        />
                        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>/ {totalChunks}</span>
                        <Tooltip title={t("chat.saveOffset")}>
                          <Button
                            type="text"
                            size="small"
                            style={{ padding: 0, minWidth: 16, height: 16 }}
                            icon={<CheckOutlined style={{ fontSize: 10 }} />}
                            onClick={() => {
                              const n = parseInt(editValue, 10);
                              if (n > 0 && n <= totalChunks && f.onSetOffset) {
                                f.onSetOffset(n - 1);
                                setEditingFileId(null);
                              }
                            }}
                          />
                        </Tooltip>
                      </span>
                    ) : (
                      <span className={styles.modalFileChunks}>
                        <FileTextOutlined style={{ fontSize: 11 }} />
                        {readChunks}/{totalChunks}
                        {!processing && (
                          <Tooltip title={t("chat.editOffset")}>
                            <button
                              className={styles.modalEditBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFileId(f.fileId);
                                setEditValue(String(readChunks));
                              }}
                            >
                              <EditOutlined style={{ fontSize: 10 }} />
                            </button>
                          </Tooltip>
                        )}
                      </span>
                    )
                  )}
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
              {!isParsing && !isError && (
                <div className={styles.modalProgressTrack}>
                  <span
                    className={`${styles.modalProgressFill} ${pct >= 100 ? styles.progressDone : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
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
