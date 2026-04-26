const NEXT_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/next/dist-tags";

const originalFetch = globalThis.fetch?.bind(globalThis);

if (typeof originalFetch === "function" && typeof globalThis.Response === "function") {
  let installedVersion = "0.0.0";

  try {
    installedVersion = require("next/package.json").version || installedVersion;
  } catch {}

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;

    // Next 16 checks npm dist-tags during dev startup with no timeout.
    // On some Windows/network setups that request hangs forever and the
    // console stays on "Starting...". Return a local stub instead.
    if (url === NEXT_DIST_TAGS_URL) {
      return new Response(
        JSON.stringify({
          latest: installedVersion,
          canary: installedVersion,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return originalFetch(input, init);
  };
}
