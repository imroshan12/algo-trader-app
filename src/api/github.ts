/**
 * Read-only GitHub client.
 *
 * This app issues GET requests against the Contents API and nothing else. It
 * cannot commit, dispatch workflows, or mutate state, so the daily Actions
 * cron that maintains the portfolio is unaffected by anything here.
 * Authenticated reads are capped at 5,000/hour; a phone opened a few times a
 * day uses three per refresh.
 *
 * Every request takes an AbortSignal and carries its own timeout. Mobile
 * networks fail by hanging rather than by refusing, so a fetch with no
 * deadline is a spinner that never stops.
 */

import { decode as decodeBase64 } from 'js-base64';

import { SleeveState } from '../types';

const API_ROOT = 'https://api.github.com';

/** Long enough for a cold cellular connection, short enough to not feel stuck. */
const TIMEOUT_MS = 15_000;

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Which branch to read.
 *
 * GitHub Actions `schedule` triggers only ever run on the repository's DEFAULT
 * branch, so that is the branch the cron commits state to, and the only branch
 * whose state is actually being maintained. Pointing this at a feature branch
 * shows you state nothing is updating.
 */
export const DEFAULT_REPO: RepoRef = {
  owner: 'imroshan12',
  repo: 'algo-trader',
  branch: 'main',
};

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when the failure is about the token itself, not this one file. */
    readonly isAuth = false,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * An aborted request is not a failure — it means we moved on. Callers use
 * this to drop the result silently instead of rendering an error the user
 * caused by pulling to refresh twice.
 */
export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

function describeStatus(status: number, subject: string): GitHubError {
  switch (status) {
    case 401:
      return new GitHubError(
        'Token rejected. It may be expired, revoked, or mistyped.', status, true,
      );
    case 403:
      return new GitHubError(
        'Access denied. Check the token grants Contents: Read on this repository.',
        status, true,
      );
    case 404:
      return new GitHubError(
        `Not found: ${subject}. Either it has not been committed to this branch yet, or the token cannot see this repository.`,
        status,
      );
    case 429:
      return new GitHubError('Rate limited by GitHub. Try again in a few minutes.', status);
    default:
      return new GitHubError(`GitHub returned ${status} for ${subject}.`, status);
  }
}

function headers(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function request(
  token: string,
  url: string,
  accept: string,
  subject: string,
  signal?: AbortSignal,
): Promise<Response> {
  // Chain the caller's signal to a timeout, so either can end the request.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { headers: headers(token, accept), signal: controller.signal });
  } catch (e) {
    // The caller cancelled: propagate as-is so it can be ignored.
    if (signal?.aborted) throw e;
    // We cancelled: the network never answered.
    if (isAbortError(e)) {
      throw new GitHubError('GitHub did not respond. Check your connection and try again.');
    }
    throw new GitHubError('No network connection.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (!res.ok) throw describeStatus(res.status, subject);
  return res;
}

/** Shape GitHub returns when it serves the default JSON representation. */
interface ContentsEnvelope {
  content?: string;
  encoding?: string;
}

function looksLikeEnvelope(v: unknown): v is ContentsEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ContentsEnvelope).content === 'string' &&
    (v as ContentsEnvelope).encoding === 'base64'
  );
}

/**
 * Fetch a file's contents.
 *
 * We ask for the `raw` media type, which makes GitHub return the file body
 * directly. But media-type handling is not something to bet on: if the header
 * is not honoured, GitHub serves its default representation instead, which
 * wraps the file in an envelope and base64-encodes it. Both shapes are handled
 * here so a change on GitHub's side cannot silently break the app.
 *
 * Decoding uses `js-base64` rather than a hand-rolled decoder. React Native has
 * no `atob`, and decoding by hand with `String.fromCharCode` corrupts any
 * multi-byte character.
 */
export async function fetchSleeveState(
  token: string,
  path: string,
  repo: RepoRef = DEFAULT_REPO,
  signal?: AbortSignal,
): Promise<SleeveState> {
  const url = `${API_ROOT}/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${repo.branch}`;
  const res = await request(token, url, 'application/vnd.github.raw+json', path, signal);
  const body = await res.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Surface what actually arrived — "not valid JSON" alone says nothing.
    const head = body.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new GitHubError(
      `${path} did not return JSON. GitHub sent: ${head || '(empty response)'}`,
    );
  }

  // Default representation: unwrap and decode.
  if (looksLikeEnvelope(parsed)) {
    try {
      parsed = JSON.parse(decodeBase64(parsed.content!));
    } catch {
      throw new GitHubError(
        `${path} is base64-wrapped but its contents are not valid JSON.`,
      );
    }
  }

  assertSleeveState(parsed, path);
  return parsed;
}

/**
 * Guard against silently rendering the wrong object.
 *
 * Without this, an unexpected response that happens to be valid JSON would be
 * cast to SleeveState, every field would read as undefined, and the app would
 * cheerfully display a flat, wrong portfolio. Failing loudly is better.
 */
function assertSleeveState(v: unknown, path: string): asserts v is SleeveState {
  const bad = (why: string) =>
    new GitHubError(`${path} is not a portfolio state file — ${why}.`);

  if (typeof v !== 'object' || v === null) throw bad('expected an object');
  const o = v as Record<string, unknown>;

  if (typeof o.cash !== 'number') throw bad('missing a numeric "cash" field');
  if (typeof o.positions !== 'object' || o.positions === null) {
    throw bad('missing a "positions" object');
  }
  if (!Array.isArray(o.equity_curve)) throw bad('missing an "equity_curve" array');
}

/** Cheap probe used by the setup screen to validate a token before storing it. */
export async function verifyAccess(
  token: string,
  repo: RepoRef = DEFAULT_REPO,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await request(
      token,
      `${API_ROOT}/repos/${repo.owner}/${repo.repo}`,
      'application/vnd.github+json',
      `${repo.owner}/${repo.repo}`,
      signal,
    );
    return { ok: true };
  } catch (e) {
    if (isAbortError(e)) throw e;
    return {
      ok: false,
      message: e instanceof GitHubError ? e.message : 'Could not reach GitHub.',
    };
  }
}

/** When the state file was last committed — i.e. when the cron last ran. */
export async function fetchLastCommit(
  token: string,
  path: string,
  repo: RepoRef = DEFAULT_REPO,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const url =
      `${API_ROOT}/repos/${repo.owner}/${repo.repo}/commits` +
      `?path=${encodeURIComponent(path)}&sha=${repo.branch}&per_page=1`;
    const res = await request(token, url, 'application/vnd.github+json', path, signal);
    const commits = (await res.json()) as Array<{
      commit?: { committer?: { date?: string } };
    }>;
    return commits[0]?.commit?.committer?.date ?? null;
  } catch (e) {
    if (isAbortError(e)) throw e;
    // A missing timestamp is cosmetic — never fail the whole refresh over it.
    return null;
  }
}
