"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { remarkWikiLink } from "../model/remark-wiki-link";
import { WikiLink } from "./wiki-link";
import type { Components } from "react-markdown";
import styles from "./md-viewer.module.css";

interface ITocItem {
  id: string;
  text: string;
  level: number;
}

interface IMdViewerProps {
  content: string;
  onNavigate?: (docId: string, anchor?: string) => void;
  scrollTo?: string;
  showToc?: boolean;
}

/** Extract TOC from rendered HTML by querying heading IDs after mount */
function useToc(content: string): ITocItem[] {
  return useMemo(() => {
    const headingRe = /^(#{1,4})\s+(.+)$/gm;
    const items: ITocItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(content)) !== null) {
      const level = match[1]!.length;
      const text = match[2]!.trim();
      // generate slug matching rehype-slug
      const id = text
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      items.push({ id, text, level });
    }
    return items;
  }, [content]);
}

export const MdViewer = ({ content, onNavigate, scrollTo, showToc = false }: IMdViewerProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const toc = useToc(content);
  const [activeId, setActiveId] = useState<string>("");

  const handleTocClick = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }, []);

  // Scroll to anchor on mount / when scrollTo changes
  useEffect(() => {
    if (!scrollTo) return;
    // Small delay so ReactMarkdown has rendered
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector(`#${CSS.escape(scrollTo)}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveId(scrollTo);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollTo]);

  const components: Components = useMemo(
    () => ({
      span(props) {
        const { node, children, ...rest } = props;
        // Handle wikiLink nodes rendered by remarkWikiLink
        const href = (node?.properties as Record<string, string> | undefined)?.["data-wiki-link"];
        if (href) {
          const [docId, anchor] = href.split("|");
          return (
            <WikiLink
              docId={docId!}
              anchor={anchor || null}
              onNavigate={onNavigate}
            />
          );
        }
        return <span {...rest}>{children}</span>;
      },
    }),
    [onNavigate]
  );

  return (
    <div className={styles.viewer}>
      {showToc && toc.length > 0 && (
        <aside className={styles.toc}>
          <div className={styles.tocTitle}>Содержание</div>
          <nav className={styles.tocNav}>
            {toc.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.tocItem} ${styles[`tocLevel${item.level}`]} ${
                  activeId === item.id ? styles.tocItemActive : ""
                }`}
                onClick={() => handleTocClick(item.id)}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>
      )}
      <div className={styles.content} ref={contentRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkWikiLink]}
          rehypePlugins={[rehypeSlug]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
