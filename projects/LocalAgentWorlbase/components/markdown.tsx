"use client";

import { useState, type ReactNode } from "react";
import { CopyIcon } from "@/components/ui/icons";

function inline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const parts = text.split(pattern).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language || "code"}</span>
        <button onClick={copy} aria-label="Copy code"><CopyIcon size={14} />{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let code: string[] = [];
  let codeLang = "";
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={`p-${nodes.length}`}>{inline(paragraph.join("\n"))}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length || !listType) return;
    const items = list.map((item, i) => <li key={i}>{inline(item)}</li>);
    nodes.push(listType === "ol"
      ? <ol key={`ol-${nodes.length}`}>{items}</ol>
      : <ul key={`ul-${nodes.length}`}>{items}</ul>);
    list = [];
    listType = null;
  };

  const flushCode = () => {
    nodes.push(<CodeBlock key={`code-${nodes.length}`} language={codeLang} value={code.join("\n")} />);
    code = [];
    codeLang = "";
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      i -= 1;
      nodes.push(
        <div className="table-scroll" key={`table-${nodes.length}`}>
          <table>
            <thead><tr>{headers.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = inline(heading[2]);
      nodes.push(level === 1
        ? <h1 key={`h-${nodes.length}`}>{text}</h1>
        : level === 2
          ? <h2 key={`h-${nodes.length}`}>{text}</h2>
          : <h3 key={`h-${nodes.length}`}>{text}</h3>);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const quoted = [quote[1]];
      while (i + 1 < lines.length) {
        const next = /^>\s?(.*)$/.exec(lines[i + 1]);
        if (!next) break;
        quoted.push(next[1]);
        i += 1;
      }
      nodes.push(<blockquote key={`quote-${nodes.length}`}>{quoted.map((item, index) => <p key={index}>{inline(item)}</p>)}</blockquote>);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push(<hr key={`hr-${nodes.length}`} />);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      list.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      list.push(numbered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();

  return <div className="markdown">{nodes}</div>;
}
