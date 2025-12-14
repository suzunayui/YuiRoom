import type { ReactNode } from "react";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(escapeRegExp(q), "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <span
        key={`h:${start}`}
        style={{
          background: "rgba(250,166,26,0.22)",
          border: "1px solid rgba(250,166,26,0.35)",
          borderRadius: 6,
          padding: "0 3px",
        }}
      >
        {text.slice(start, end)}
      </span>
    );
    last = end;
    if (out.length > 400) break;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

function splitTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (!".,!?;:)]}›»\"'".includes(last)) break;
    trailing = last + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: InlineToken[] }
  | { kind: "em"; children: InlineToken[] }
  | { kind: "del"; children: InlineToken[] };

type CodeSplitToken = { kind: "text"; text: string } | { kind: "code"; text: string };

function tokenizeInline(text: string): CodeSplitToken[] {
  const out: CodeSplitToken[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf("`", i);
    if (idx === -1) {
      out.push({ kind: "text", text: text.slice(i) });
      break;
    }
    if (idx > i) out.push({ kind: "text", text: text.slice(i, idx) });
    const end = text.indexOf("`", idx + 1);
    if (end === -1) {
      out.push({ kind: "text", text: text.slice(idx) });
      break;
    }
    out.push({ kind: "code", text: text.slice(idx + 1, end) });
    i = end + 1;
  }
  return out;
}

function parseEmStrongDel(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;

  function pushText(s: string) {
    if (!s) return;
    tokens.push({ kind: "text", text: s });
  }

  while (i < text.length) {
    const nextBold = text.indexOf("**", i);
    const nextDel = text.indexOf("~~", i);
    const nextEm = text.indexOf("*", i);

    let next = -1;
    let kind: "strong" | "del" | "em" | null = null;

    const candidates: Array<{ pos: number; kind: "strong" | "del" | "em"; len: number }> = [];
    if (nextBold !== -1) candidates.push({ pos: nextBold, kind: "strong", len: 2 });
    if (nextDel !== -1) candidates.push({ pos: nextDel, kind: "del", len: 2 });
    if (nextEm !== -1) candidates.push({ pos: nextEm, kind: "em", len: 1 });

    candidates.sort((a, b) => a.pos - b.pos);
    const c = candidates[0];
    if (!c) {
      pushText(text.slice(i));
      break;
    }

    next = c.pos;
    kind = c.kind;

    if (next > i) pushText(text.slice(i, next));

    const markerLen = kind === "em" ? 1 : 2;
    const close = text.indexOf(kind === "strong" ? "**" : kind === "del" ? "~~" : "*", next + markerLen);
    if (close === -1) {
      pushText(text.slice(next));
      break;
    }

    const inner = text.slice(next + markerLen, close);
    // prevent empty / whitespace-only formatting blocks from eating content
    if (!inner.trim()) {
      pushText(text.slice(next, close + markerLen));
      i = close + markerLen;
      continue;
    }

    const children = parseEmStrongDel(inner);
    tokens.push({ kind, children } as any);
    i = close + markerLen;
  }

  return tokens;
}

function renderInlineTokens(tokens: InlineToken[], query?: string, keyPrefix = "t"): ReactNode[] {
  const out: ReactNode[] = [];

  function renderToken(tok: InlineToken, idx: number): ReactNode {
    if (tok.kind === "text") return query ? renderHighlightedText(tok.text, query) : tok.text;
    if (tok.kind === "code") {
      return (
        <code
          key={`${keyPrefix}:c:${idx}`}
          style={{
            background: "#202225",
            border: "1px solid #40444b",
            borderRadius: 6,
            padding: "1px 6px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.92em",
            overflowWrap: "anywhere",
            wordBreak: "break-all",
          }}
        >
          {tok.text}
        </code>
      );
    }
    if (tok.kind === "strong") {
      return (
        <strong key={`${keyPrefix}:b:${idx}`} style={{ fontWeight: 900 }}>
          {renderInlineTokens(tok.children, query, `${keyPrefix}:b:${idx}`)}
        </strong>
      );
    }
    if (tok.kind === "em") {
      return (
        <em key={`${keyPrefix}:i:${idx}`} style={{ fontStyle: "italic" }}>
          {renderInlineTokens(tok.children, query, `${keyPrefix}:i:${idx}`)}
        </em>
      );
    }
    return (
      <s key={`${keyPrefix}:d:${idx}`} style={{ opacity: 0.9 }}>
        {renderInlineTokens(tok.children, query, `${keyPrefix}:d:${idx}`)}
      </s>
    );
  }

  for (let i = 0; i < tokens.length; i++) out.push(renderToken(tokens[i], i));
  return out;
}

function renderRichChunk(text: string, query?: string, keyPrefix = "k"): ReactNode[] {
  const out: ReactNode[] = [];
  const codeSplit = tokenizeInline(text);
  for (let i = 0; i < codeSplit.length; i++) {
    const part = codeSplit[i];
    if (part.kind === "code") {
      out.push(
        <code
          key={`${keyPrefix}:c:${i}`}
          style={{
            background: "#202225",
            border: "1px solid #40444b",
            borderRadius: 6,
            padding: "1px 6px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.92em",
            overflowWrap: "anywhere",
            wordBreak: "break-all",
          }}
        >
          {part.text}
        </code>
      );
      continue;
    }
    const inline = parseEmStrongDel(part.text);
    out.push(...renderInlineTokens(inline, query, `${keyPrefix}:t:${i}`));
  }
  return out;
}

export function renderTextWithLinks(text: string): ReactNode {
  return renderTextWithLinksAndHighlights(text, "");
}

export function renderTextWithLinksAndHighlights(text: string, query: string): ReactNode {
  if (!text) return "";

  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text))) {
    const raw = match[1];
    const start = match.index;
    const end = start + raw.length;

    if (start > lastIndex) out.push(...renderRichChunk(text.slice(lastIndex, start), query, `p:${start}`));

    const { url, trailing } = splitTrailingPunctuation(raw);
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;

    out.push(
      <a
        key={`u:${start}`}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "#00a8fc", textDecoration: "underline", wordBreak: "break-all" }}
      >
        {url}
      </a>
    );
    if (trailing) out.push(...renderRichChunk(trailing, query, `tr:${start}`));

    lastIndex = end;
  }

  if (lastIndex < text.length) out.push(...renderRichChunk(text.slice(lastIndex), query, `p:${lastIndex}`));
  if (out.length === 0) return query ? renderHighlightedText(text, query) : text;
  return out;
}
