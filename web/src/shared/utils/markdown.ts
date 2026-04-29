import { marked } from 'marked';

const renderer = new marked.Renderer();

renderer.link = ({ href, text }) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

marked.setOptions({ breaks: true });

export function renderMarkdown(text: string): string {
  try {
    const result = marked.parse(text, { renderer, async: false });
    return typeof result === 'string' ? result : text;
  } catch {
    return text.replace(/\n/g, '<br>');
  }
}
