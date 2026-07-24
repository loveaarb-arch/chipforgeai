---
name: RevenueCat setup quirks
description: Gotchas hit during RevenueCat integration for the ChipForge Expo app.
---

## SDK client — Request object method bug

`createClient` from `@replit/revenuecat-sdk/client` calls the custom `fetch` option with `input` as a `Request` object (not a plain URL string). The method, headers, and body live on the `Request`, not on the `init` argument. Always extract from both:

```ts
const method = init?.method ?? (input instanceof Request ? input.method : "GET");
const body = init?.body ?? (input instanceof Request && method !== "GET" ? await input.text() : undefined);
const headers = { ...headersToPlain(req?.headers), ...headersToPlain(init?.headers) };
```

**Why:** The SDK uses the hey-api fetch client which passes a pre-built `Request` object, leaving `init` mostly empty. Ignoring this defaulted every call to GET.

## Proxy path must include /v2

The `ReplitConnectors.proxy("revenuecat", path)` path must be relative to `api.revenuecat.com`, not the SDK base URL. Set `baseUrl: "https://api.revenuecat.com/v2"` for the SDK, but strip only `https://api.revenuecat.com` (not `/v2`) when computing the proxy path, so the proxy receives `/v2/projects` not `/projects`.

## test_store app cannot be created manually

`createApp` with `type: "test_store"` returns a 400 parameter error. The test store app is auto-provisioned by RevenueCat when a project is created. If the project was created in a broken state (wrong body), the test store won't exist. Workaround: use the iOS app's public API key as the `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` — Expo Go uses Preview API Mode regardless of which valid key is provided.

## Project-scoped token blocks createProject

The Replit RevenueCat connector issues a project-scoped token. `POST /v2/projects` returns 403. The seed script must use the first existing project rather than creating a new one.

## Content-Type must be set explicitly for proxy POST calls

The proxy does not infer Content-Type. For JSON bodies, always pass `"content-type": "application/json"` in the headers dict.

## Seed script is idempotent

All RevenueCat entities (products, entitlements, offerings, packages) are looked up before creation. Re-running the seed script is safe.

## Env vars set

Project: `proj4fa4d26c`, iOS app: `app04578dcba8`, Android app: `appd94c522d53`. Keys stored as `EXPO_PUBLIC_REVENUECAT_*` in shared env.
