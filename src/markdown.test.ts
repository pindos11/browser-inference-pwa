// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
describe('markdown rendering', () => { it('keeps code but removes executable markup', () => { const html = renderMarkdown('`safe`<script>alert(1)</script>'); expect(html).toContain('<code>safe</code>'); expect(html).not.toContain('script'); }); });
