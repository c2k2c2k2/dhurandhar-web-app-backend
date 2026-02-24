import katex from 'katex';
import * as sanitizeHtml from 'sanitize-html';

const QUESTION_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'sup',
  'sub',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
  'div',
  'hr',
] as const;

const QUESTION_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  span: ['data-question-math-inline', 'class'],
  div: ['data-question-math-block', 'class'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
};

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(value: string): string {
  if (!value) return '';
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, token: string) => {
    if (token.startsWith('#x')) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (token.startsWith('#')) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITY_MAP[token] ?? match;
  });
}

function normalizeStoredLatex(raw: string): string {
  const decoded = decodeHtmlEntities(raw || '').trim();
  if (!decoded) return '';

  if (decoded.startsWith('"') && decoded.endsWith('"')) {
    try {
      const parsed = JSON.parse(decoded);
      if (typeof parsed === 'string') {
        return parsed.trim();
      }
    } catch {
      // Keep fallback normalization below.
    }
  }

  if (
    (decoded.startsWith('"') && decoded.endsWith('"')) ||
    (decoded.startsWith("'") && decoded.endsWith("'"))
  ) {
    return decoded.slice(1, -1).trim();
  }

  return decoded;
}

export function sanitizeQuestionHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [...QUESTION_ALLOWED_TAGS],
    allowedAttributes: QUESTION_ALLOWED_ATTRIBUTES,
    disallowedTagsMode: 'discard',
  }).trim();
}

export function sanitizeQuestionContent(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeQuestionContent(item));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  let hasHtml = false;

  Object.entries(input).forEach(([key, entry]) => {
    if (key === 'html' && typeof entry === 'string') {
      const cleaned = sanitizeQuestionHtml(entry);
      if (cleaned) {
        output[key] = cleaned;
        hasHtml = true;
      }
      return;
    }

    const nextValue = sanitizeQuestionContent(entry);
    if (nextValue !== undefined) {
      output[key] = nextValue;
    }
  });

  if (hasHtml && typeof output.format !== 'string') {
    output.format = 'RICH_TEXT_V1';
  }

  return output;
}

export function extractTextFromQuestionHtml(value: string): string {
  const withMathTokens = value
    .replace(
      /<(span|div)[^>]*\sdata-question-math-inline=(["'])(.*?)\2[^>]*>[\s\S]*?<\/\1>/gi,
      (_match, _tag, _quote, latex: string) => ` ${decodeHtmlEntities(latex)} `,
    )
    .replace(
      /<(span|div)[^>]*\sdata-question-math-block=(["'])(.*?)\2[^>]*>[\s\S]*?<\/\1>/gi,
      (_match, _tag, _quote, latex: string) => ` ${decodeHtmlEntities(latex)} `,
    );

  const stripped = sanitizeHtml(withMathTokens, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

export function extractQuestionSearchFragments(value: unknown): string[] {
  const fragments: string[] = [];

  const walk = (input: unknown, parentKey?: string) => {
    if (input === null || input === undefined) {
      return;
    }

    if (typeof input === 'string') {
      const text = parentKey === 'html' ? extractTextFromQuestionHtml(input) : input;
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (normalized) {
        fragments.push(normalized);
      }
      return;
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      fragments.push(String(input));
      return;
    }

    if (Array.isArray(input)) {
      input.forEach((item) => walk(item));
      return;
    }

    if (typeof input === 'object') {
      Object.entries(input as Record<string, unknown>).forEach(([key, entry]) => {
        walk(entry, key);
      });
    }
  };

  walk(value);
  return fragments;
}

function renderMathExpression(latexRaw: string, displayMode: boolean): string {
  const latex = normalizeStoredLatex(latexRaw);
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
  });
}

export function renderQuestionHtmlWithMath(value: string): string {
  const sanitized = sanitizeQuestionHtml(value);

  return sanitized
    .replace(
      /<span[^>]*\sdata-question-math-inline=(["'])(.*?)\1[^>]*>[\s\S]*?<\/span>/gi,
      (_match, _quote, latex: string) => `<span class="question-math-inline">${renderMathExpression(latex, false)}</span>`,
    )
    .replace(
      /<div[^>]*\sdata-question-math-block=(["'])(.*?)\1[^>]*>[\s\S]*?<\/div>/gi,
      (_match, _quote, latex: string) => `<div class="question-math-block">${renderMathExpression(latex, true)}</div>`,
    );
}
