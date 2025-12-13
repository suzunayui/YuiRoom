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

export function renderTextWithLinks(text: string): ReactNode {
  if (!text) return "";

  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text))) {
    const raw = match[1];
    const start = match.index;
    const end = start + raw.length;

    if (start > lastIndex) out.push(text.slice(lastIndex, start));

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
    if (trailing) out.push(trailing);

    lastIndex = end;
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  if (out.length === 0) return text;
  return out;
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

    if (start > lastIndex) out.push(renderHighlightedText(text.slice(lastIndex, start), query));

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
    if (trailing) out.push(trailing);

    lastIndex = end;
  }

  if (lastIndex < text.length) out.push(renderHighlightedText(text.slice(lastIndex), query));
  if (out.length === 0) return renderHighlightedText(text, query);
  return out;
}
