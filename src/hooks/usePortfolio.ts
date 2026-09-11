/**
 * The app's data layer.
 *
 * One hook owns fetching, cancellation, and the distinction between "we have
 * nothing yet" and "we have something and are checking for newer". That
 * distinction is what lets the UI keep showing yesterday's figures while a
 * refresh is in flight instead of collapsing to a spinner — a portfolio that
 * blanks itself every time you pull down feels broken even when it isn't.
 *
 * Requests are aborted on unmount and superseded whenever a newer one starts,
 * so a slow response can never land after a fast one and show stale data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { Sleeve, SLEEVE_CONFIG } from '../types';
import { fetchSleeveState, fetchLastCommit, GitHubError, isAbortError } from '../api/github';
import { SAMPLE_MODE, SAMPLE_STATES } from '../dev/sample';

export type Phase = 'loading' | 'ready' | 'failed';

export interface PortfolioModel {
  phase: Phase;
  sleeves: Sleeve[];
  lastRun: string | null;
  /** A refresh is in flight over data we already have. */
  refreshing: boolean;
  /** Set only when nothing could be loaded at all. */
  error: string | null;
  /** The failure was the token, not the data — the UI offers reconnecting. */
  authFailed: boolean;
  fetchedAt: number | null;
  refresh: () => void;
}

/** Coming back to the app after this long is worth a silent re-check. */
const STALE_AFTER_MS = 60_000;

export function usePortfolio(token: string): PortfolioModel {
  const [sleeves, setSleeves] = useState<Sleeve[] | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // Read inside the AppState listener, which must not re-subscribe every
  // time the timestamp changes.
  const fetchedAtRef = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      if (mode === 'refresh') setRefreshing(true);

      try {
        const loaded = await Promise.all(
          SLEEVE_CONFIG.map(async (cfg): Promise<Sleeve> => {
            const shell = {
              key: cfg.key,
              name: cfg.name,
              rule: cfg.rule,
              thesis: cfg.thesis,
              idleExplanation: cfg.idleExplanation,
              capital: cfg.capital,
            };
            try {
              const state = SAMPLE_MODE
                ? SAMPLE_STATES[cfg.key]
                : await fetchSleeveState(token, cfg.path, undefined, controller.signal);
              return { ...shell, state };
            } catch (e) {
              if (isAbortError(e)) throw e;
              return {
                ...shell,
                state: null,
                error: e instanceof Error ? e.message : 'Could not load this sleeve.',
              };
            }
          }),
        );

        const commit = SAMPLE_MODE
          ? new Date(Date.now() - 3 * 3600_000).toISOString()
          : await fetchLastCommit(token, SLEEVE_CONFIG[0].path, undefined, controller.signal);

        if (!mounted.current || controller.signal.aborted) return;

        // Every sleeve failing is not two independent problems — it is one
        // problem with the token or the network. Say that once, rather than
        // stacking identical error cards.
        const allFailed = loaded.every((s) => s.state === null);
        if (allFailed) {
          setError(loaded[0]?.error ?? 'Could not reach GitHub.');
          setAuthFailed(loaded.some((s) => /token|access denied/i.test(s.error ?? '')));
          // Deliberately leave `sleeves` alone: a failed refresh should not
          // erase the portfolio that is already on screen.
        } else {
          setSleeves(loaded);
          setLastRun(commit);
          setError(null);
          setAuthFailed(false);
          const now = Date.now();
          setFetchedAt(now);
          fetchedAtRef.current = now;
        }
      } catch (e) {
        if (isAbortError(e) || !mounted.current) return;
        setError(e instanceof GitHubError ? e.message : 'Could not reach GitHub.');
      } finally {
        if (mounted.current && !controller.signal.aborted) setRefreshing(false);
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [token],
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  const refresh = useCallback(() => {
    load('refresh');
  }, [load]);

  // Returning to a portfolio screen that is showing figures from hours ago is
  // the most common way this app is wrong. Re-check quietly on foreground.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      const at = fetchedAtRef.current;
      // Nothing loaded yet means the initial load is still running or has
      // failed with its own retry button — don't race it.
      if (at === null || Date.now() - at < STALE_AFTER_MS) return;
      load('refresh');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [load]);

  const phase: Phase =
    sleeves !== null ? 'ready' : error !== null ? 'failed' : 'loading';

  return {
    phase,
    sleeves: sleeves ?? [],
    lastRun,
    refreshing,
    error,
    authFailed,
    fetchedAt,
    refresh,
  };
}
