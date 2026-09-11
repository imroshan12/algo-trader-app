/** Recognise which kind of GitHub token was pasted, from its prefix. */

export type TokenKind = 'fine-grained' | 'classic' | 'unknown' | 'empty';

/**
 * Classic tokens (ghp_) grant access to every repository the account can
 * see. They work here, but a fine-grained token scoped to one repository is
 * the right tool, so the difference is worth a sentence before connecting.
 */
export function classifyToken(raw: string): TokenKind {
  const v = raw.trim();
  if (!v) return 'empty';
  if (v.startsWith('github_pat_')) return 'fine-grained';
  if (v.startsWith('ghp_')) return 'classic';
  return 'unknown';
}
