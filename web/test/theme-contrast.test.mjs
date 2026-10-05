import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8');
function rgb(hsl) {
  const [h, s, l] = hsl.split(/\s+/).map(Number);
  const saturation = s / 100, lightness = l / 100;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map(offset => {
    const phase = (offset + h / 30) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(phase - 3, 9 - phase, 1));
  });
}
function luminance(color) {
  return color.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const selector of [':root', '.light']) {
  test(`${selector} primary buttons and muted labels meet normal-text contrast`, () => {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const token = name => {
      const match = block.match(new RegExp(`--${name}: ([\\d\\s.%]+);`));
      assert.ok(match, `Missing ${name}`);
      return rgb(match[1].replaceAll('%', ''));
    };
    for (const brightness of [1, 1.1, 0.95]) {
      assert.ok(contrast(token('primary').map(v => Math.min(1, v * brightness)), token('primary-foreground').map(v => Math.min(1, v * brightness))) >= 4.5, `Primary brightness ${brightness}`);
    }
    for (const background of ['background', 'card', 'muted']) {
      assert.ok(contrast(token('muted-foreground'), token(background)) >= 4.5, `Muted text on ${background}`);
    }
  });
}
