import { afterEach, describe, expect, it, vi } from "vitest";
import { enabledOAuthProviders } from "./supabase";

const settings = (external: Record<string, boolean>) => new Response(JSON.stringify({ external }), { status: 200 });

describe("enabledOAuthProviders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns only the providers the project has switched on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => settings({ email: true, github: true, google: false, azure: false })),
    );
    expect(await enabledOAuthProviders()).toEqual(["github"]);
  });

  it("keeps the display order google, azure, github", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => settings({ github: true, azure: true, google: true })),
    );
    expect(await enabledOAuthProviders()).toEqual(["google", "azure", "github"]);
  });

  it("is unknown (null) when the settings cannot be read, so every button stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    expect(await enabledOAuthProviders()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    expect(await enabledOAuthProviders()).toBeNull();
  });
});
