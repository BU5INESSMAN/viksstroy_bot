/**
 * Lightweight Markdown renderer for AI chat messages.
 * Handles: **bold**, *italic*, `code`, newlines, lists, | tables |, headings.
 * Zero dependencies.
 */
import React from 'react';

/* ────── public ────── */

export function renderMarkdown(text) {
  if (!text) return null;

  const blocks = text.split(/\n\n+/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');

    // Table detection: first line has |, second line has ---
    if (lines.length >= 2 && lines[0].includes('|') && lines[1].includes('---')) {
      return <Table key={bi} lines={lines} />;
    }

    return (
      <div key={bi} className="mb-2 last:mb-0">
        {lines.map((line, li) => (
          <Line key={li} text={line} />
        ))}
      </div>
    );
  });
}

/* ────── table ────── */

function Table({ lines }) {
  const split = (l) => l.split('|').map(c => c.trim()).filter(Boolean);
  const headers = split(lines[0]);
  const rows = lines.slice(2).filter(l => l.includes('|')).map(split);

  return (
    <div className="overflow-x-auto mb-2 rounded-lg border border-white/10">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border-b border-white/10 px-2 py-1.5 text-left font-semibold text-gray-700 dark:text-white/70 bg-gray-50 dark:bg-white/5">{inline(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1.5 text-gray-600 dark:text-white/60">{inline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────── line-level ────── */

function Line({ text }) {
  // Headings
  if (text.startsWith('### ')) return <p className="text-sm font-semibold text-gray-800 dark:text-white/90 mt-2 mb-0.5">{inline(text.slice(4))}</p>;
  if (text.startsWith('## '))  return <p className="text-sm font-bold text-gray-800 dark:text-white/90 mt-2 mb-0.5">{inline(text.slice(3))}</p>;
  if (text.startsWith('# '))   return <p className="font-bold text-gray-900 dark:text-white mt-2 mb-0.5">{inline(text.slice(2))}</p>;

  // List items
  const m = text.match(/^(\s*)([-*•]|\d+[.)]\s*)(.+)/);
  if (m) {
    const pad = Math.min(m[1].length, 4) * 8;
    return (
      <div className="flex gap-1.5 items-start" style={pad ? { paddingLeft: pad } : undefined}>
        <span className="text-gray-400 dark:text-white/30 flex-shrink-0 select-none">•</span>
        <span>{inline(m[3])}</span>
      </div>
    );
  }

  // Horizontal rule
  if (/^[-—=]{3,}$/.test(text.trim())) return <hr className="border-white/10 my-1" />;

  // Empty
  if (!text.trim()) return <div className="h-1" />;

  // Regular
  return <div>{inline(text)}</div>;
}

/* ────── inline formatting ────── */

let _key = 0;
function inline(text) {
  if (!text) return text;

  // Combined regex: **bold** | *italic* | `code`
  // Process **bold** before *italic* to avoid conflicts
  const rx = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g;
  const parts = [];
  let last = 0;
  let match;

  while ((match = rx.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[2] != null) {
      parts.push(<strong key={++_key} className="font-semibold text-gray-900 dark:text-white">{match[2]}</strong>);
    } else if (match[3] != null) {
      parts.push(<code key={++_key} className="px-1 py-0.5 rounded bg-gray-200/80 dark:bg-white/10 text-blue-600 dark:text-blue-300 text-xs font-mono">{match[3]}</code>);
    } else if (match[4] != null) {
      parts.push(<em key={++_key} className="italic">{match[4]}</em>);
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
