## Goal
Port P-Stream's player + scraper pipeline into this app as a **secondary source**, selectable in Settings. Viduki embed stays the default primary. This is a multi-turn effort — this plan lays out the shape of the work.

## Scope reality check

P-Stream is ~4.2MB of source: 114 player files, 40 backend/scraper files, 61 stores, plus the `@p-stream/providers` package (the actual scraping engine) and a proxy Worker (`simple-proxy`) that CORS-bypasses providers. A true "exact logic + exact UI" port cannot land in one turn without breaking the app. This plan does it in layered PRs.

## Architecture

```text
Settings toggle: "Primary source"
   ├── "viduki" (default, existing embed)      → StreamPlayer (iframe)
   └── "pstream" (new)                          → PStreamPlayer (native)

PStreamPlayer
   ├── Scraper: @p-stream/providers
   │      └── proxied through /api/public/pstream-proxy (server route)
   ├── Video engine: hls.js + native <video>
   ├── UI: ported from p-stream/src/components/player
   └── Stores: ported from p-stream/src/stores/player (jotai-based)
```

## PR breakdown

### PR 1 — Foundation (this turn)
- Add `@p-stream/providers`, `jotai`, `@headlessui/react` deps.
- Add server route `src/routes/api/public/pstream-proxy.ts` (mirrors P-Stream's `simple-proxy` — forwards `X-Origin`, `X-Referer`, strips CORS).
- Add setting `primarySource: "viduki" | "pstream"` to `src/lib/store.ts`, radio in `src/routes/settings.tsx`.
- Add stub `src/components/pstream/PStreamPlayer.tsx` wired into `StreamPlayer.tsx` — falls back to Viduki if scraping fails.
- Route selection in `StreamPlayer` reads the setting.

### PR 2 — Scraper wiring
- Copy `src/backend/providers/*` from P-Stream (provider control, run-output, embed-scrape flow).
- Wire providers to `makeProviders({ fetcher: makeSimpleProxyFetcher(...) })`.
- Return HLS URL + captions to PStreamPlayer.

### PR 3 — Player UI port
- Copy `src/components/player/{base,display,internals,atoms}` folders.
- Port jotai stores under `src/stores/player/`.
- Adapt import paths (`@/` prefix, remove i18n, remove Turnstile).
- Wire caption/quality/audio-track menus.

### PR 4 — Polish & fixes
- Fullscreen, PiP, keyboard shortcuts, gestures.
- Subtitle styling settings.
- Verify continue-watching progress still writes correctly.
- Verify FebBox path unchanged.

## Files touched in PR 1 (this turn)
- `package.json` — add `@p-stream/providers`, `jotai`
- `src/routes/api/public/pstream-proxy.ts` — new
- `src/lib/store.ts` — add `primarySource` state
- `src/routes/settings.tsx` — add source picker
- `src/components/pstream/PStreamPlayer.tsx` — new (basic hls.js player + provider call)
- `src/components/StreamPlayer.tsx` — branch on `primarySource`

## What will NOT work after PR 1
- Full P-Stream UI (menus, subtitle styling, gestures) — comes in PR 3
- Some providers requiring Turnstile — deferred
- Casting — deferred

## Confirm before I start
1. OK to proceed with PR 1 today, PR 2–4 in follow-up turns?
2. OK to bundle `@p-stream/providers` (adds ~200KB)?
3. Proxy at `/api/public/pstream-proxy` OK, or do you have an external proxy URL you want me to use?