import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('index hides the app until the real stylesheet is ready', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.match(html, /class="cs-awaiting-styles"/);
  assert.match(html, /id="mainStyles"/);
  assert.match(html, /cs-styles-ready/);
  assert.match(html, /#wrap\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(html, /html\.cs-styles-ready #wrap\s*\{[^}]*visibility:\s*visible/s);
  assert.doesNotMatch(html, /#introTitleWork\s*\{/);
  assert.doesNotMatch(html, /cs-preboot/);
  assert.doesNotMatch(html, /boot-curtain/);
  assert.doesNotMatch(html, /INITIALIZING DISPLAY BUS/);
});
