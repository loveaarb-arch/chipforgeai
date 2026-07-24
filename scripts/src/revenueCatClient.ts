import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

const API_HOST = "https://api.revenuecat.com";
const API_BASE = `${API_HOST}/v2`;

function headersToPlain(init?: HeadersInit | Headers | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  if (typeof (init as Headers).forEach === "function") {
    (init as Headers).forEach((v, k) => { out[k] = v; });
  } else if (Array.isArray(init)) {
    for (const [k, v] of init as [string, string][]) out[k] = v;
  } else {
    Object.assign(out, init);
  }
  return out;
}

/**
 * Returns a RevenueCat API client authenticated via the Replit connector proxy.
 * Called "uncachable" because the underlying OAuth token can rotate — never cache this.
 */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  const client = createClient({
    baseUrl: API_BASE,
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // The SDK may pass a Request object as `input` with method/body/headers on it.
      const req = input instanceof Request ? input : null;

      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      const path = urlStr.startsWith(API_HOST) ? urlStr.slice(API_HOST.length) : urlStr;

      // Method: prefer init (overrides), then Request object, then default GET
      const method = (init?.method ?? req?.method ?? "GET").toUpperCase();

      // Headers: merge Request headers with any init overrides
      const headers: Record<string, string> = {
        ...headersToPlain(req?.headers),
        ...headersToPlain(init?.headers),
      };
      if (!headers["content-type"] && method !== "GET" && method !== "HEAD") {
        headers["content-type"] = "application/json";
      }

      // Body: prefer init.body, then read from Request if needed
      let body: string | undefined;
      if (init?.body != null) {
        body = String(init.body);
      } else if (req && method !== "GET" && method !== "HEAD") {
        body = await req.text();
      }

      const response = await connectors.proxy("revenuecat", path, {
        method: method as "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
        headers,
        body,
      });

      return response as unknown as Response;
    },
  });

  return client;
}
