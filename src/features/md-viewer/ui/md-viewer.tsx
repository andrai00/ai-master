"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import GithubSlug from "github-slugger";
import { MenuOutlined } from "@ant-design/icons";
import { remarkWikiLink } from "../model/remark-wiki-link";
import { remarkFormulaRef } from "../model/remark-formula-ref";
import { remarkChatLink } from "../model/remark-chat-link";
import { WikiLink } from "./wiki-link";
import { FormulaBlock, FormulaInlineRef } from "./formula-block";
import { ChatNavLink } from "./chat-nav-link";
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
      const rawText = match[2]!.trim();
      const id = slugger.slug(rawText);       // slug from RAW text — matches rehypeSlug
      const text = cleanTocText(rawText);     // clean text for display
      if (!id) continue;
      items.push({ id, text, level });
    }
    return items;
  }, [content]);
}

export const MdViewer = ({ content, onNavigate, scrollTo, showToc = false }: IMdViewerProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Strip blockquote markers from table rows and fix separator/header order.
  // Some imported content has `> | col |` (blockquote pollution) and
  // separator row BEFORE header (| --- | before | Header |).
  const cleanContent = useMemo(() => {
    let c = content.replace(/^[ \t]*>[ \t]*(\|[^\n]+)/gm, "$1");
    c = c.replace(/^(\|[ \t]*:?-{3,}:?[ \t]*\|[^\n]*\n)(\|[^-\n][^\n]*\|[^\n]*\n)/gm, "$2$1");
    // rehype-raw strips empty <a> without href — rewrite to <span>
    c = c.replace(/<a id=/g, "<span id=");
    c = c.replace(/<\/a>/g, "</span>");
    return c;
  }, [content]);

  const toc = useToc(content);  // headings are fine, no > pollution
  const [activeId, setActiveId] = useState<string>("");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const formulaResults = useMemo(() => {
    const blocks = parseFormulaBlocks(cleanContent);
    if (blocks.length === 0) return new Map<string, IFormulaResult>();
    return evaluateFormulas(blocks).results;
  }, [cleanContent]);

  const handleTocClick = useCallback((id: string) => {
    if (!id) return;
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
    setMobileTocOpen(false);
  }, []);

  // Scroll to top on mount — only if no anchor is provided
  useEffect(() => {
    if (scrollTo !== undefined) return;
    const id = requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scrollTo === undefined) return;
    const timer = setTimeout(() => {
      if (scrollTo === "") {
        contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const slugger = new GithubSlug();
      const slug = slugger.slug(scrollTo);
      const el = contentRef.current?.querySelector(`#${CSS.escape(slug)}`) ||
                 contentRef.current?.querySelector(`[id="${scrollTo}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveId(slug);
      }
    }, 200);
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
        const chatLink = properties?.["data-chat-link"];
        if (chatLink) {
          return <ChatNavLink chatKey={chatLink} />;
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
        if (href && /^#/.test(href)) {
          const anchorRaw = href.slice(1);
          const slugger = new GithubSlug();
          const slug = slugger.slug(anchorRaw);
          return (
            <button
              type="button"
              onClick={() => {
                const el = contentRef.current?.querySelector(`#${CSS.escape(slug)}`) ||
                           contentRef.current?.querySelector(`[id="${anchorRaw}"]`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                font: "inherit",
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "var(--text-muted)",
              }}
            >
              {children}
            </button>
          );
        }
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
        if (href && /^\/[^)]*\.md(?:#.+)?$/.test(href)) {
          const [pathPart, hashPart] = (href as string).split("#");
          const cleanPath = (pathPart ?? "").replace(/\.md$/i, "").replace(/^\//, "");
          return (
            <WikiLink
              docId={cleanPath}
              anchor={hashPart || undefined}
              displayText={typeof children === "string" ? children : undefined}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <span>
            <span style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: "var(--text-muted)" }}>
              {children}
            </span>
            <a href={href} target="_blank" rel="noopener noreferrer" className={styles.extIcon}>
              &#x2197;
            </a>
          </span>
        );
      },
      table(props) {
        return (
          <div style={{ overflowX: "auto", display: "block" }}>
            <table {...props} />
          </div>
        );
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
          remarkPlugins={[remarkGfm, remarkWikiLink, remarkFormulaRef, remarkChatLink]}
          rehypePlugins={[rehypeRaw, rehypeSlug]}
          components={components}
        >
          {cleanContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};
