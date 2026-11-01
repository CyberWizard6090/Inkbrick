import { ALIASES, LANGUAGES } from './languages';
import { scanCss } from './scan/css';
import { scanGeneric } from './scan/generic';
import { scanHtml } from './scan/html';
import { scanMarkdown } from './scan/markdown';
import { type Emit } from './scan/shared';
import { scanYaml } from './scan/yaml';
import type { CodeHighlighter, HighlightToken } from './types';

/** Длиннее этого текста блок не подсвечивается: подсветка пересчитывается на каждое нажатие клавиши. */
export const HIGHLIGHT_LIMIT = 100_000;

export function normalizeLanguage(language: string): string {
  const name = language.trim().toLowerCase();

  return ALIASES[name] ?? name;
}

/**
 * Встроенный подсветчик: без зависимостей, по правилам для распространённых языков (JavaScript/TypeScript, Python,
 * Go, Rust, Java, C/C++, Bash, SQL, JSON, YAML, HTML/XML, CSS, Markdown). Это не полноценный разбор, а быстрая
 * лексическая раскраска; для точности подключите свой `CodeHighlighter` (Shiki, Prism, highlight.js).
 * Неизвестный язык, `plain` и слишком длинный текст дают пустой список токенов.
 */
export const highlightCode: CodeHighlighter = (code, language) => {
  const name = normalizeLanguage(language);

  if (code.length === 0 || code.length > HIGHLIGHT_LIMIT) return [];

  const tokens: HighlightToken[] = [];
  const emit: Emit = (from, to, type) => {
    if (to > from) tokens.push({ from, to, type });
  };

  switch (name) {
    case 'html':
      scanHtml(code, 0, code.length, emit);
      break;
    case 'css':
      scanCss(code, 0, code.length, emit);
      break;
    case 'markdown':
      scanMarkdown(code, 0, code.length, emit);
      break;
    case 'yaml':
      scanYaml(code, 0, code.length, emit);
      break;
    default: {
      const lang = LANGUAGES[name];

      if (lang) scanGeneric(code, lang, 0, code.length, emit);
    }
  }

  return tokens;
};
