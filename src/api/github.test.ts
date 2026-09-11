import { encode } from 'js-base64';

import { fetchSleeveState, GitHubError } from './github';

const VALID_STATE = {
  schema: 'trend-v1',
  cash: 200000,
  positions: {},
  pending_buys: [],
  trades: [],
  equity_curve: [
    { date: '2026-09-10', equity: 200000, cash: 200000, invested_mtm: 0, num_positions: 0 },
  ],
  trial_start_date: '2026-09-10',
};

function mockResponse(body: string, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('fetchSleeveState — response shapes', () => {
  it('reads the raw representation', async () => {
    mockResponse(JSON.stringify(VALID_STATE));
    const state = await fetchSleeveState('tok', 'state/portfolio_next50.json');
    expect(state.cash).toBe(200000);
    expect(state.equity_curve).toHaveLength(1);
  });

  it('unwraps and decodes the base64 envelope GitHub sends by default', async () => {
    // This is the shape returned when the raw media type is not honoured.
    mockResponse(
      JSON.stringify({
        name: 'portfolio_next50.json',
        encoding: 'base64',
        content: encode(JSON.stringify(VALID_STATE)),
      }),
    );
    const state = await fetchSleeveState('tok', 'state/portfolio_next50.json');
    expect(state.cash).toBe(200000);
    expect(state.schema).toBe('trend-v1');
  });

  it('decodes multi-byte characters without corrupting them', async () => {
    // A hand-rolled String.fromCharCode decoder mangles this.
    const withUnicode = { ...VALID_STATE, note: '₹ नमस्ते' };
    mockResponse(
      JSON.stringify({ encoding: 'base64', content: encode(JSON.stringify(withUnicode)) }),
    );
    const state = (await fetchSleeveState('tok', 'p.json')) as typeof withUnicode;
    expect(state.note).toBe('₹ नमस्ते');
  });
});

describe('fetchSleeveState — failure modes', () => {
  it('reports what actually arrived when the body is not JSON', async () => {
    mockResponse('<!DOCTYPE html><html>Not Found</html>');
    await expect(fetchSleeveState('tok', 'state/x.json')).rejects.toThrow(
      /did not return JSON.*DOCTYPE/,
    );
  });

  it('names an empty response rather than saying nothing', async () => {
    mockResponse('');
    await expect(fetchSleeveState('tok', 'state/x.json')).rejects.toThrow(
      /\(empty response\)/,
    );
  });

  it('rejects JSON that parses but is not a state file', async () => {
    // The dangerous case: without a guard this renders as a flat, wrong portfolio.
    mockResponse(JSON.stringify({ message: 'Not Found', status: '404' }));
    await expect(fetchSleeveState('tok', 'state/x.json')).rejects.toThrow(
      /not a portfolio state file/,
    );
  });

  it('names the specific missing field', async () => {
    mockResponse(JSON.stringify({ cash: 100, positions: {} })); // no equity_curve
    await expect(fetchSleeveState('tok', 'state/x.json')).rejects.toThrow(
      /missing an "equity_curve" array/,
    );
  });

  it('explains a 404 in terms the user can act on', async () => {
    mockResponse('{}', false, 404);
    await expect(fetchSleeveState('tok', 'state/missing.json')).rejects.toThrow(
      /not been committed to this branch yet|cannot see this repository/,
    );
  });

  it('surfaces an expired token as a token problem', async () => {
    mockResponse('{}', false, 401);
    const err = await fetchSleeveState('tok', 'p.json').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.message).toMatch(/Token rejected/);
  });

  it('reports a network failure as such', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchSleeveState('tok', 'p.json')).rejects.toThrow(/No network connection/);
  });
});

// ── Cancellation and auth classification ──

import { isAbortError, verifyAccess } from './github';

describe('request lifecycle', () => {
  it('rethrows a caller abort untouched, so it can be ignored', async () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort) as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    const err = await fetchSleeveState(
      'tok', 'state/portfolio.json', undefined, controller.signal,
    ).catch((e) => e);
    expect(isAbortError(err)).toBe(true);
    // Specifically not converted into a user-facing GitHubError.
    expect(err).not.toBeInstanceOf(GitHubError);
  });

  it('marks 401 and 403 as token problems, and 404 as not', async () => {
    for (const [status, isAuth] of [[401, true], [403, true], [404, false]] as const) {
      mockResponse('{}', false, status);
      const err = await fetchSleeveState('tok', 'x.json').catch((e) => e);
      expect(err).toBeInstanceOf(GitHubError);
      expect(err.isAuth).toBe(isAuth);
    }
  });

  it('verifyAccess reports a message rather than throwing', async () => {
    mockResponse('{}', false, 401);
    const r = await verifyAccess('bad');
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/Token rejected/) });
  });
});
