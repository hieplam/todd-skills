import { expect, test } from 'bun:test';
import { renderLivePage } from './page.ts';

test('the shell is self-contained, read-only-labelled and links its two assets', () => {
  const html = renderLivePage({ repoKey: 'a', slug: 'b', processId: null });
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('<link rel="stylesheet" href="/app.css">');
  expect(html).toContain('<script type="module" src="/app.js"></script>');
  expect(html).toContain('read-only');
  expect(html).toContain('href="/"');
});

test('it carries the campaign identity as data attributes for the client', () => {
  const html = renderLivePage({ repoKey: 'repo-key', slug: 'the-slug', processId: 'card:T20' });
  expect(html).toContain('data-repo="repo-key"');
  expect(html).toContain('data-slug="the-slug"');
  expect(html).toContain('data-process="card:T20"');
});

test('campaign identifiers are escaped, never interpolated raw', () => {
  const html = renderLivePage({ repoKey: '"><img src=x>', slug: 'b', processId: null });
  expect(html).not.toContain('<img src=x>');
});

test('it contains no form, button or input — there is no control surface', () => {
  const html = renderLivePage({ repoKey: 'a', slug: 'b', processId: null });
  for (const tag of ['<form', '<input', '<textarea', '<button']) expect(html).not.toContain(tag);
});
