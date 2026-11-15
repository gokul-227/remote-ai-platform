import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { shareUrl, withUtm, socialMetadata, SHARE_NETWORKS } from "@/lib/share";
import { ShareButtons } from "./ShareButtons";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: { get: mocks.get, post: mocks.post },
  extractErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { ContactResults, FindGoogleContacts } from "./GoogleContacts";

const PAGE = "https://remoteaiplatform.com/jobs/abc";

describe("share links", () => {
  it("adds UTM tags naming the network", () => {
    const u = new URL(withUtm(PAGE, "linkedin"));
    expect(u.searchParams.get("utm_source")).toBe("linkedin");
    expect(u.searchParams.get("utm_medium")).toBe("social");
    expect(u.searchParams.get("utm_campaign")).toBe("share");
  });

  it("builds plain share URLs for every network", () => {
    const hosts: Record<string, string> = {
      linkedin: "https://www.linkedin.com/sharing/share-offsite/",
      x: "https://twitter.com/intent/tweet",
      facebook: "https://www.facebook.com/sharer/sharer.php",
      whatsapp: "https://wa.me/",
      reddit: "https://www.reddit.com/submit",
      telegram: "https://t.me/share/url",
      email: "mailto:",
    };
    for (const n of SHARE_NETWORKS) {
      const url = shareUrl(n, PAGE, "Role & co");
      expect(url.startsWith(hosts[n])).toBe(true);
      expect(decodeURIComponent(url)).toContain(`utm_source=${n}`);
    }
  });

  it("gives every shared page Open Graph and Twitter card tags", () => {
    const m = socialMetadata({ title: "T", description: "D", path: "/jobs/1", type: "article" });
    expect(m.openGraph.images[0].url).toBe("/opengraph-image.png");
    expect(m.twitter.card).toBe("summary_large_image");
    expect(m.openGraph.url).toBe("/jobs/1");
  });

  it("renders accessible links and copies a tagged link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareButtons url={PAGE} title="A job" label="Share this job" />);
    expect(screen.getByRole("group", { name: "Share this job" })).toBeTruthy();
    const li = screen.getByRole("link", { name: /Share on LinkedIn/ });
    expect(li.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "Share by email" }).getAttribute("href")).toMatch(/^mailto:/);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByText("Link copied")).toBeTruthy());
    expect(writeText.mock.calls[0][0]).toContain("utm_source=copy");
  });

  it("offers the Web Share API when the device has it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    render(<ShareButtons url={PAGE} title="A job" />);
    fireEvent.click(await screen.findByRole("button", { name: "Share with an app on this device" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    // @ts-expect-error cleanup
    delete navigator.share;
  });
});

describe("Google contacts finder", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it("stays hidden while the feature flag is off", async () => {
    mocks.get.mockResolvedValue({ data: { enabled: false } });
    const { container } = render(<FindGoogleContacts onNotice={() => {}} />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/contacts/google/status"));
    expect(container.textContent).toBe("");
  });

  it("starts the consent through the API when enabled", async () => {
    mocks.get.mockResolvedValue({ data: { enabled: true } });
    mocks.post.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    render(<FindGoogleContacts onNotice={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Find people you know from Google" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1"));
    expect(mocks.post.mock.calls[0][1].redirect_uri).toMatch(/\/contacts\/callback$/);
  });

  it("connects with matches and invites only the ticked contacts", async () => {
    mocks.post.mockResolvedValue({ data: { invited: 1, remaining_today: 24 } });
    render(
      <ContactResults
        result={{
          matches: [{ id: "u1", full_name: "Friend", connection_status: null }],
          invitable: [
            { email: "a@y.org", name: "Ann", token: "t1", invited: false },
            { email: "b@y.org", name: null, token: "t2", invited: false },
            { email: "c@y.org", name: "Old", token: "t3", invited: true },
          ],
          remaining_today: 25,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/connections", { receiver_id: "u1" }));
    expect((screen.getByRole("checkbox", { name: /Old/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ann/ }));
    fireEvent.click(screen.getByRole("button", { name: /Invite 1 selected/ }));
    await waitFor(() => expect(screen.getByText("Invitations sent: 1.")).toBeTruthy());
    expect(mocks.post).toHaveBeenLastCalledWith("/contacts/invites", {
      contacts: [{ email: "a@y.org", name: "Ann", token: "t1" }],
    });
  });
});
