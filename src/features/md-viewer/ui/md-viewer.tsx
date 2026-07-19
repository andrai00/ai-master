"use client";

import type { ReactNode } from "react";
import styles from "./md-viewer.module.css";

interface IMdViewerProps {
  children: ReactNode;
}

export const MdViewer = ({ children }: IMdViewerProps) => {
  return (
    <div className={styles.viewer}>
      <div className={styles.content}>{children}</div>
    </div>
  );
};
