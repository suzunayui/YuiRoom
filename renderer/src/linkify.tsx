import type { ReactNode } from "react";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi;

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

