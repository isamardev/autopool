import { DIGITAL_POOL_API_HEADER } from "@/lib/digital-pool-api-constants";

/** Use for `/api/user/*` from Digital Pool so the pool cookie is used instead of NextAuth. */
export function poolApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set(DIGITAL_POOL_API_HEADER, "1");
  return fetch(input, { ...init, headers, credentials: "include" });
}
