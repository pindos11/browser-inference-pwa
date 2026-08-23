import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source) as string, { FORBID_TAGS: ['style', 'script', 'iframe', 'object'], FORBID_ATTR: ['style', 'onerror', 'onclick'], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i });
}
