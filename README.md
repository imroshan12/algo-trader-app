# AlgoTrader

A small React Native app (iOS + Android) for checking the state of an automated
paper-trading portfolio from your phone.

---

## ⚠️ This app does not trade. It is a viewer.

**There is no strategy logic in this repository.** No signals, no backtests, no orders.
The app renders JSON that something else produced.

That something else is a separate **backing repository** which:

- runs the trading strategies on a schedule (GitHub Actions cron)
- writes its portfolio state to JSON files
- commits those files back to itself

This app authenticates to that repository, reads those files, and draws them. If you
clone this repo and run it without such a backing repository, **it will start up and
then fail to load anything** — there is nothing for it to read.

The backing repository this is built against is private, so cloning this app alone
will not give you a working portfolio.

---

## How the pieces fit

```
┌──────────────────────────────────────────┐
│  Backing repo  (private, not this one)   │
│                                          │
│  GitHub Actions cron, weekdays           │
│    ├─ runs the strategies                │
│    ├─ marks the portfolio to market      │
│    └─ commits state/*.json               │
└──────────────────────┬───────────────────┘
                       │  read-only, GitHub Contents API
                       ▼
┌──────────────────────────────────────────┐
│  This app                                │
│    reads the JSON, renders it            │
└──────────────────────────────────────────┘
```

**The app only ever issues GET requests.** It cannot commit, cannot dispatch workflows,
and cannot modify state. Nothing you do in the app can affect the scheduled job.

Authenticated GitHub reads are capped at 5,000/hour. Each refresh uses three.

---

## What it expects from the backing repo

Two things, and it is entirely generic beyond them.

**1. State files at known paths.** Configured in [`src/types.ts`](src/types.ts):

```ts
export const SLEEVE_CONFIG = [
  { key: 'momentum', path: 'state/portfolio.json',
    name: 'Momentum', rule: 'Nifty 50 · top 10 · monthly', capital: 100_000 },
  { key: 'next50',   path: 'state/portfolio_next50.json',
    name: 'Next 50 Trend', rule: 'Nifty Next 50 · per-stock trend', capital: 200_000 },
];
```

Add, remove or rename entries here and the portfolio screen follows — no other change
needed.

**2. A JSON shape.** Each state file must contain at least:

```jsonc
{
  "cash": 100000,
  "positions": {                    // ticker → position
    "RELIANCE.NS": {
      "ticker": "RELIANCE.NS", "quantity": 7, "entry_price": 1313.1,
      "entry_date": "2026-09-11", "invested": 9191.7,
      "entry_costs": 11, "sector": "Energy"
    }
  },
  "pending_buys": [                 // queued, fill at next session open
    { "ticker": "HAL.NS", "reference_price": 4950, "quantity": 2, "reason": "Uptrend" }
  ],
  "trades": [                       // full history; exits carry pnl_net
    { "ticker": "X.NS", "action": "SELL", "date": "2026-09-11", "price": 120,
      "quantity": 10, "notional": 1200, "costs": 20, "reason": "…", "pnl_net": 175 }
  ],
  "equity_curve": [                 // one entry per session — see note below
    { "date": "2026-09-11", "equity": 105000, "cash": 90000,
      "invested_mtm": 15000, "num_positions": 1 }
  ],
  "trial_start_date": "2026-09-02"
}
```

The full TypeScript definitions are in [`src/types.ts`](src/types.ts).

### On valuation

The **last entry of `equity_curve` is the authoritative valuation.** The backing repo
computes it against real closing prices; the app reads it rather than recomputing.

This matters: `positions[].entry_price` is what was *paid*, not what a holding is
*worth*. Deriving portfolio value from entry prices gives cost basis and misreports
every open position. The holdings list is therefore labelled **"at cost"**, and the
header states which session close the totals reflect.

---

## Running it

```bash
npm install
npx expo start          # then scan the QR with Expo Go
```

Or build natively:

```bash
npx expo run:ios        # or open ios/AlgoTrader.xcworkspace in Xcode
npx expo run:android
```

```bash
npm test                # 11 tests over the pure logic
npm run typecheck
```

### If `pod install` fails

Two failures are common on macOS and neither is a bug in this project:

| Error | Cause | Fix |
|---|---|---|
| `Unicode Normalization not appropriate for ASCII-8BIT` | `LANG` is unset | `export LANG=en_US.UTF-8` in `~/.zshrc` |
| `undefined method 'exists?' for class File` | Ruby 3.3+ removed `File.exists?`; an old dependency still calls it | Update the offending package — the current versions here are clean |

---

## First run — connecting

The backing repo is private, so the app needs a read-only token.

1. Open <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** → *Only select repositories* → your backing repo
3. **Permissions** → Repository permissions → **Contents: Read-only**. Nothing else.
4. Generate, copy, paste into the app.

Set a **90-day expiry** so a leak has a bounded lifetime.

The token is stored in the iOS keychain / Android keystore via `expo-secure-store`,
scoped `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. It is never written to the filesystem, never
placed in the JS bundle, and never sent anywhere except `api.github.com`. **Disconnect**
on the portfolio screen erases it.

### Which branch it reads

`main`, set in [`src/api/github.ts`](src/api/github.ts).

This is deliberate: GitHub Actions `schedule` triggers only ever fire on a repository's
**default branch**. That is the branch the cron commits state to, and the only branch
whose state is actually being maintained. Pointing this at a feature branch shows you
data nothing is updating.

---

## Security

This repository is public; the repository it reads is private. That asymmetry is the
thing to be careful about.

- **No credential is committed here.** The token is entered at runtime and lives only
  in the device keychain.
- **A pre-commit hook blocks token-shaped strings.** Enable it after cloning:
  ```bash
  git config core.hooksPath .githooks
  ```
- **Do not publish a build of this to an app store.** It is built to run on your own
  device with your own token.

The token is fine-grained, read-only and scoped to one repository, so the worst case if
it leaks is that someone can read a paper-trading portfolio. Still worth the expiry.

---

## What it shows

- **Combined total** across all sleeves, with return against deployed capital
- **Per sleeve** — equity, cash, invested (mark-to-market), exits, realised P&L, costs,
  days running
- **A state chip** saying *why* a sleeve looks the way it does: holding positions,
  orders queued, or deliberately in cash — so a zero reads as a decision rather than a
  failure
- **Holdings** at cost, with quantity, entry price and entry date
- **Queued orders** waiting to fill at the next session open
- **When the cron last ran**, from the state file's most recent commit

Pull down to refresh. Amounts use Indian digit grouping (₹1,00,000), matching how they
read on an NSE broker statement.

---

## Layout

```
App.tsx                        Root — routes between setup and portfolio
src/
  api/github.ts                Read-only Contents API client
  storage/token.ts             Keychain-backed token storage
  lib/format.ts                Rupee formatting, valuation, state derivation
  lib/format.test.ts           Tests for the above
  theme.ts                     Light/dark palettes
  components/SleeveCard.tsx    One sleeve panel
  screens/SetupScreen.tsx      First-run token entry
  screens/PortfolioScreen.tsx  Main dashboard
  types.ts                     State-file shapes and sleeve config
```

## Licence

MIT — see [LICENSE](LICENSE).
