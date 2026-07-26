"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import GithubSlug from "github-slugger";
import { MenuOutlined } from "@ant-design/icons";
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

/** Extract TOC using github-slugger — matches rehype-slug's slug generation exactly. */
function useToc(content: string): ITocItem[] {
  return useMemo(() => {
    const headingRe = /^(#{1,4})\s+(.+)$/gm;
    const slugger = new GithubSlug();
    const items: ITocItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(content)) !== null) {
      const level = match[1]!.length;
      const text = match[2]!.trim();
      const id = slugger.slug(text);
      // GithubSlug returns empty string for headings with no slug-worthy content
      if (!id) continue;
      items.push({ id, text, level });
    }
    return items;
  }, [content]);
}

export const MdViewer = ({ content, onNavigate, scrollTo, showToc = false }: IMdViewerProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const toc = useToc(content);
  const [activeId, setActiveId] = useState<string>("");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const handleTocClick = useCallback((id: string) => {
    if (!id) return;
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
    // On mobile, close TOC after selection
    setMobileTocOpen(false);
  }, []);

  // Scroll to anchor on mount / when scrollTo changes
  useEffect(() => {
    if (!scrollTo) return;
    // Small delay so ReactMarkdown has rendered
    const timer = setTimeout(() => {
      if (!scrollTo) return;
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
          const displayText = (node?.properties as Record<string, string> | undefined)?.["data-wiki-display"] || null;
          return (
            <WikiLink
              docId={docId!}
              anchor={anchor || null}
              displayText={displayText}
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
        <>
          <button
            type="button"
            className={styles.tocToggle}
            onClick={() => setMobileTocOpen((v) => !v)}
          >
            <MenuOutlined className={`${styles.tocToggleIcon} ${mobileTocOpen ? styles.tocToggleIconOpen : ""}`} />
            Содержание
          </button>
          <aside className={`${styles.toc} ${mobileTocOpen ? styles.tocOpen : ""}`}>
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
        </>
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
