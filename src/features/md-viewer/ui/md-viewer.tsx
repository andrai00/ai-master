"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./md-viewer.module.css";

interface IMdViewerProps {
  content: string;
}

export const MdViewer = ({ content }: IMdViewerProps) => {
  return (
    <div className={styles.viewer}>
      <div className={styles.content}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
