import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...args: unknown[]) => get(...args) }, extractErrorMessage: () => "Request failed" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "member", full_name: "Member" } }) }));
import { Feed } from "./rap_social";
describe("community feed discovery", () => {
  beforeEach(() => get.mockReset());
  it("uses bounded pages and resets pagination for audience, search and global sorting", async () => {
    get.mockResolvedValue({ data: { posts: [], has_more: true }, headers: {} });
    render(<Feed />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/social/feed", { params: { page: 1, page_size: 20, q: "", order: "latest" } }));
    fireEvent.click(await screen.findByRole("button", { name: "Next posts" }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/social/feed", { params: { page: 2, page_size: 20, q: "", order: "latest" } }));
    fireEvent.change(screen.getByRole("combobox", { name: "Feed audience" }), { target: { value: "public" } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/social/posts/public", { params: { page: 1, page_size: 20, q: "", order: "latest" } }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search post content" }), { target: { value: "100% remote" } });
    fireEvent.click(screen.getByRole("button", { name: "Search posts" }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/social/posts/public", { params: { page: 1, page_size: 20, q: "100% remote", order: "latest" } }));
    fireEvent.change(screen.getByRole("combobox", { name: "Feed order" }), { target: { value: "most_liked" } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/social/posts/public", { params: { page: 1, page_size: 20, q: "100% remote", order: "most_liked" } }));
  });
  it("reports an API failure and retries instead of showing a false empty feed", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    render(<Feed />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Your feed is quiet")).not.toBeInTheDocument();
    get.mockResolvedValue({ data: { posts: [], has_more: false }, headers: {} });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Your feed is quiet");
  });
});
