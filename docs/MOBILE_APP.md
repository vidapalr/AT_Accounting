# Mobile app plan

Goal: the same business rules on the web and on a phone app, with no second copy of the logic.

## Where we are (17 Nov 2026)

| Ready now | Where |
| --- | --- |
| Installable on a phone ("Add to Home screen"), full screen, company name and logo | `src/app/manifest.webmanifest/route.ts`, `viewport` in `src/app/layout.tsx` |
| Fonts stored in the project (no Google download), usable by an app bundle | `src/fonts/` |
| Menu is plain data with modules, so a phone menu can be built from the same list | `src/lib/navigation.ts` (`menuFor`) |
| Business rules in `src/lib` as pure functions (sales maths, stock, GST split, letters, ledger posting, account mapping) | `src/lib/*-math.ts`, `src/lib/ledger/*`, `src/lib/staff-letters.ts` |
| Company, brand and settings resolved on the server, not in screens | `src/lib/tenant.ts`, `src/lib/brand.ts`, `src/lib/business-settings.ts` |
| Shared styles are plain objects a phone app can map | `src/lib/ui/styles.ts` |

## Steps to the app

1. **Phone-first staff screens (now):** billing, stock count, cash closing, shop spending and follow-ups already work on a phone and can be installed from the browser.
2. **API v1 (next):** a JSON API under `/api/v1/*` with token sign-in for devices (separate from the browser cookie), calling the same `src/lib` functions the server actions use. Rule for every new feature from now: put the work in a `src/lib` function that both the server action and the API can call.
3. **App shell:** wrap the web app with Capacitor (fastest; reuses these screens) or build React Native screens on the API (best feel). Decision when step 2 is done; Capacitor first is recommended.
4. **Offline billing:** keep bills on the phone when the internet drops and send them when it is back (needs the API and a one-time token per bill, which billing already uses).
5. **Phone features:** barcode scanning with the camera, push notifications for approvals and online orders, WhatsApp share from the phone.

## Rules for code written now

- No logic inside `page.tsx`: read data, call `src/lib`, show it.
- Every action has a plain function in `src/lib` that takes `(businessId, userId, input)` and returns a result, so an API route can call it.
- No browser-only tricks for core work (no `window` in business rules).
