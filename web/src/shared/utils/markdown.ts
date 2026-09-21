import DOMPurify from 'dompurify';
import { marked } from 'marked';

const markdownTags = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'del',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

export function renderMarkdown(text: string): string {
  try {
    const html = marked.parse(text, { breaks: true, async: false });
    // Model output is untrusted, including raw HTML and generated link attributes.
    // Keep only document formatting; embedded media, forms and styles are excluded.
    const fragment = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: markdownTags,
      ALLOWED_ATTR: ['href', 'title'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
    for (const link of fragment.querySelectorAll('a[href]')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
    const container = document.createElement('div');
    container.append(fragment);
    return container.innerHTML;
  } catch {
    // Failure must never return raw model HTML to the v-html sink.
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
}
