import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const { window } = new JSDOM('');
globalThis.window = window;
globalThis.document = window.document;
const { renderMarkdown } = await import('../src/shared/utils/markdown.ts');

function render(source) {
  const container = document.createElement('div');
  container.innerHTML = renderMarkdown(source);
  return container;
}

test('preserves ordinary Markdown and safe links with opener isolation', () => {
  const output = render(
    '# Heading\n\n**bold** and *italic* and `code`\n\n- item\n\n[link](https://example.com?q=one&next=two "Title")\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  );
  assert.equal(output.querySelector('h1')?.textContent, 'Heading');
  assert.equal(output.querySelector('strong')?.textContent, 'bold');
  assert.equal(output.querySelector('em')?.textContent, 'italic');
  assert.equal(output.querySelector('code')?.textContent, 'code');
  assert.equal(output.querySelector('li')?.textContent, 'item');
  assert.equal(output.querySelectorAll('td').length, 2);
  const link = output.querySelector('a');
  assert.equal(
    link?.getAttribute('href'),
    'https://example.com?q=one&next=two',
  );
  assert.equal(link?.getAttribute('title'), 'Title');
  assert.equal(link?.getAttribute('target'), '_blank');
  assert.equal(link?.getAttribute('rel'), 'noopener noreferrer');
});

test('removes scripts, handlers, styles and active embedded content', () => {
  const output = render(
    '<script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)></svg><iframe srcdoc="<script>alert(1)</script>"></iframe><form><input autofocus onfocus=alert(1)></form><p onclick="alert(1)" style="color:red" id="location" data-x="bad">safe</p>',
  );
  assert.equal(
    output.querySelector('script,img,svg,iframe,form,input,style'),
    null,
  );
  assert.equal(output.querySelector('[onclick],[style],[id],[data-x]'), null);
  assert.equal(output.querySelector('p')?.textContent, 'safe');
});

for (const href of [
  'javascript:alert(1)',
  'jav&#x61;script:alert(1)',
  'java&#10;script:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
]) {
  test(`blocks unsafe raw HTML link: ${href}`, () => {
    const output = render(`<a href="${href}">link</a>`);
    assert.equal(output.querySelector('a[href]'), null);
    assert.equal(output.textContent.trim(), 'link');
  });
}

test('blocks unsafe Markdown URLs and attribute injection', () => {
  const output = render(
    '[bad](javascript:alert%281%29)\n\n<a href="https://example.com" title="title" onmouseover="alert(1)">good</a>',
  );
  assert.equal(output.querySelector('a')?.hasAttribute('href'), false);
  assert.equal(output.querySelector('[onmouseover]'), null);
  assert.equal(output.querySelectorAll('a[href]').length, 1);
});

test('code remains literal and fallback escapes markup when parsing fails', (context) => {
  assert.equal(
    render('`<img src=x onerror=alert(1)>`').querySelector('code')?.textContent,
    '<img src=x onerror=alert(1)>',
  );
  context.mock.method(marked, 'parse', () => {
    throw new Error('parser failure');
  });
  const source =
    '<img src=x onerror=alert(1)> & "quoted"\n<script>alert(1)</script>';
  const output = render(source);
  assert.equal(output.querySelector('img,script'), null);
  assert.equal(output.querySelectorAll('br').length, 1);
  assert.equal(output.textContent, source.replace('\n', ''));
});
