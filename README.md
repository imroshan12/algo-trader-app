# AlgoTrader

A small React Native app (iOS + Android) that shows the state of the paper-trading
sleeves maintained by the [algo-trader](https://github.com/imroshan12/algo-trader)
repository.

## The one thing to understand

**This app is read-only.** It issues `GET` requests against the GitHub Contents API
and nothing else. It cannot commit, cannot dispatch workflows, and cannot modify
state files. The daily Actions cron that actually runs the strategies is completely
unaffected by anything you do here.

```
GitHub Actions (7 PM IST, Mon–Fri)
    │  runs both sleeves, commits state/*.json
    ▼
GitHub repository (private)
    │  read-only, via Contents API
    ▼
This app  →  renders
```

Authenticated GitHub reads are capped at 5,000/hour. A phone opened a few times a
day uses a handful.

## Running it

```bash
cd AlgoTrader
npm install
npx expo start
```

Then either scan the QR code with **Expo Go** on your phone, or press `i` / `a` for a
simulator. Expo Go means you don't need a working Xcode or Android Studio install to
run this on a real device.

## First run — connecting

The algo-trader repo is private, so the app needs a read-only token. The app walks
you through it, but in short:

1. Open <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** → Only select repositories → `algo-trader`
3. **Permissions** → Repository permissions → **Contents: Read-only**. Nothing else.
4. Generate, copy, paste into the app.

The token is stored in the iOS keychain / Android keystore via `expo-secure-store`,
scoped `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. It is never written to the JS bundle, never
sent anywhere except `api.github.com`, and never leaves the device.

Tap **Disconnect** on the portfolio screen to erase it.

### Security note

A read-only token scoped to one repository is the smallest credential that does the
job — the worst case if it leaks is that someone can read a paper-trading portfolio.
Even so: **do not publish a build of this app to a public app store.** It is built to
run on your own device.

## What it shows

- **Combined total** across both sleeves, with return against deployed capital
- **Per sleeve** — equity, cash, invested, exits, realised P&L, costs, days running
- **A state chip** saying *why* a sleeve is where it is: holding positions, orders
  queued, or deliberately in cash
- **Holdings** with quantity, entry price and entry date
- **Queued orders** waiting to fill at the next session open
- **Last cron run**, derived from the state file's most recent commit

Pull down to refresh. Amounts use Indian digit grouping (₹1,00,000), matching how
they read on a broker statement.

## Project layout

```
App.tsx                        Root — routes between setup and portfolio
src/
  api/github.ts                Read-only Contents API client
  storage/token.ts             Keychain-backed token storage
  lib/format.ts                Rupee formatting, sleeve summaries, state derivation
  theme.ts                     Light/dark palettes
  components/SleeveCard.tsx    One sleeve panel
  screens/SetupScreen.tsx      First-run token entry
  screens/PortfolioScreen.tsx  Main dashboard
  types.ts                     Shapes of the state files, sleeve config
```

## Adding or changing a sleeve

`SLEEVE_CONFIG` in `src/types.ts` is the single source of truth. Each entry names the
state file path in the repo, the display name, the strategy description and the
capital allocated:

```ts
{ key: 'next50', path: 'state/portfolio_next50.json',
  name: 'Next 50 Trend', rule: 'Nifty Next 50 · per-stock trend',
  capital: 200_000 }
```

Add an entry and the portfolio screen picks it up — no other change needed.

## Building a standalone app

Expo Go is fine for daily use. For a real installable build:

```bash
npx expo install expo-dev-client
npx eas build --profile development --platform ios
```

This needs an Expo account and, for iOS device installs, an Apple developer account.
