/**
 * Read-only GitHub client.
 *
 * This app issues GET requests against the Contents API and nothing else. It
 * cannot commit, dispatch workflows, or mutate state, so the daily Actions cron
 * that maintains the portfolio is unaffected by anything here. Authenticated
 * reads are capped at 5,000/hour; a phone opened a few times a day uses three
 * per refresh.
 */

import { SleeveState } from '../types';

const API_ROOT = 'https://api.github.com';

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
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

function describeStatus(status: number, subject: string): string {
  switch (status) {
    case 401:
      return 'Token rejected. It may be expired, revoked, or mistyped.';
    case 403:
      return 'Access denied. Check the token grants Contents: Read on this repository.';
    case 404:
      return `Not found: ${subject}. Either it has not been committed to this branch yet, or the token cannot see this repository.`;
    case 429:
      return 'Rate limited by GitHub. Try again in a few minutes.';
    default:
      return `GitHub returned ${status} for ${subject}.`;
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
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: headers(token, accept) });
  } catch {
    throw new GitHubError('No network connection.');
  }
  if (!res.ok) {
    throw new GitHubError(describeStatus(res.status, subject), res.status);
  }
  return res;
}

/**
 * Fetch a file's contents.
 *
 * Uses the `raw` media type so GitHub returns the file body directly. The
 * default JSON representation base64-encodes the content, which would force us
 * to decode it by hand — React Native has no `atob`, and a hand-rolled decoder
 * mangles any non-ASCII byte. Asking for raw sidesteps that entirely.
 */
export async function fetchSleeveState(
  token: string,
  path: string,
  repo: RepoRef = DEFAULT_REPO,
): Promise<SleeveState> {
  const url = `${API_ROOT}/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${repo.branch}`;
  const res = await request(token, url, 'application/vnd.github.raw', path);
  const body = await res.text();
  try {
    return JSON.parse(body) as SleeveState;
  } catch {
    throw new GitHubError(`${path} is not valid JSON.`);
  }
}

/** Cheap probe used by the setup screen to validate a token before storing it. */
export async function verifyAccess(
  token: string,
  repo: RepoRef = DEFAULT_REPO,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await request(
      token,
      `${API_ROOT}/repos/${repo.owner}/${repo.repo}`,
      'application/vnd.github+json',
      `${repo.owner}/${repo.repo}`,
    );
    return { ok: true };
  } catch (e) {
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
): Promise<string | null> {
  try {
    const url =
      `${API_ROOT}/repos/${repo.owner}/${repo.repo}/commits` +
      `?path=${encodeURIComponent(path)}&sha=${repo.branch}&per_page=1`;
    const res = await request(token, url, 'application/vnd.github+json', path);
    const commits = (await res.json()) as Array<{
      commit?: { committer?: { date?: string } };
    }>;
    return commits[0]?.commit?.committer?.date ?? null;
  } catch {
    // A missing timestamp is cosmetic — never fail the whole refresh over it.
    return null;
  }
}
