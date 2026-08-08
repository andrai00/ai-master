"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import GithubSlug from "github-slugger";
import { MenuOutlined } from "@ant-design/icons";
import { remarkWikiLink } from "../model/remark-wiki-link";
import { remarkFormulaRef } from "../model/remark-formula-ref";
import { WikiLink } from "./wiki-link";
import { FormulaBlock, FormulaInlineRef } from "./formula-block";
import type { Components } from "react-markdown";
import { parseFormulaBlocks, evaluateFormulas, type IFormulaResult } from "@/src/shared/lib/formula";
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

function cleanTocText(raw: string): string {
  return raw
    .replace(/\[\[[^\]|#]+(?:#[^\]]+)?(?:\|([^\]]+))?\]\]/g, (_, display) => display ? display.trim() : "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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
      const text = cleanTocText(match[2]!);
      const id = slugger.slug(text);
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

  const formulaResults = useMemo(() => {
    const blocks = parseFormulaBlocks(content);
    if (blocks.length === 0) return new Map<string, IFormulaResult>();
    return evaluateFormulas(blocks).results;
  }, [content]);

  const handleTocClick = useCallback((id: string) => {
    if (!id) return;
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
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
        const properties = (node?.properties as Record<string, string> | undefined);
        const href = properties?.["data-wiki-link"];
        if (href) {
          const [docId, anchor] = href.split("|");
          const displayText = properties?.["data-wiki-display"] || null;
          return (
            <WikiLink
              docId={docId!}
              anchor={anchor || null}
              displayText={displayText}
              onNavigate={onNavigate}
            />
          );
        }
        const formulaRef = properties?.["data-formula-ref"];
        if (formulaRef) {
          return (
            <FormulaInlineRef
              varName={formulaRef}
              result={formulaResults.get(formulaRef)}
            />
          );
        }
        return <span {...rest}>{children}</span>;
      },
      code(props) {
        const { children, className, ...rest } = props;
        if (className === "language-formula") {
          const body = String(children).replace(/\n$/, "");
          const props_: Record<string, string> = {};
          for (const line of body.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const idx = trimmed.indexOf(":");
            if (idx > 0) {
              props_[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
            }
          }
          const name = props_["name"];
          if (name && formulaResults.has(name)) {
            return <FormulaBlock result={formulaResults.get(name)!} />;
          }
          return <code className={className} {...rest}>{children}</code>;
        }
        return <code className={className} {...rest}>{children}</code>;
      },
      a(props) {
        const { href, children } = props;
        if (href && /^\/doc\/([a-zA-Z0-9-]+)$/.test(href)) {
          const docId = href.slice(5);
          return (
            <WikiLink
              docId={docId}
              displayText={typeof children === "string" ? children : undefined}
              onNavigate={onNavigate}
            />
          );
        }
        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
    }),
    [onNavigate, formulaResults]
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
          remarkPlugins={[remarkGfm, remarkWikiLink, remarkFormulaRef]}
          rehypePlugins={[rehypeSlug]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
