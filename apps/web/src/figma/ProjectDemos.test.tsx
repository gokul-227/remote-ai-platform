import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), user: { id: "worker" } }));
vi.mock("@/lib/api", () => ({
  default: { get: mocks.get, post: mocks.post },
  extractErrorMessage: () => "Request failed",
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
import { ProjectDemos } from "./ProjectDemos";
const contract = {
  id: "c",
  project_id: "p",
  title: "Build",
  status: "ACTIVE",
  worker_id: "worker",
  client_id: "client",
  milestones: [{ id: "m", title: "Delivery", status: "PENDING" }],
};
const demo = { id: "d", contract_id: "c", milestone_id: "m", title: "Preview", status: "SUBMITTED", version: 1 };
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.user.id = "worker";
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({
      data:
        path === "/contracts/me" ? [contract] : path.endsWith("/view") ? { url: "https://demo.remoteai.dev/" } : [demo],
    }),
  );
  mocks.post.mockResolvedValue({ data: {} });
});
it("registers a persisted demo against the selected milestone", async () => {
  render(<ProjectDemos projectId="p" />);
  await screen.findByText("Register demo");
  fireEvent.change(screen.getByLabelText("Demo title"), { target: { value: "New preview" } });
  fireEvent.change(screen.getByLabelText("HTTPS demo URL"), { target: { value: "https://demo.remoteai.dev/" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit demo" }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith(
      "/projects/p/demos",
      expect.objectContaining({ contract_id: "c", milestone_id: "m", title: "New preview" }),
    ),
  );
  await screen.findByText("Demo submitted for review.");
});
it("authorizes the external viewer before exposing a protected link", async () => {
  render(<ProjectDemos />);
  await screen.findByText("Preview · v1");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Prepare demo link" }));
  const link = await screen.findByRole("link", { name: "Open demo in new tab" });
  expect(link).toHaveAttribute("href", "https://demo.remoteai.dev/");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(document.querySelector("iframe")).toBeNull();
});
it("requires change-request notes and offers client completion", async () => {
  mocks.user.id = "client";
  render(<ProjectDemos />);
  await screen.findByText("Preview · v1");
  expect(screen.queryByText("Register demo")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Fix layout" } });
  fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith("/projects/p/demos/d/review", {
      decision: "CHANGES_REQUESTED",
      note: "Fix layout",
    }),
  );
  await screen.findByText("Changes requested.");
  fireEvent.click(screen.getByRole("button", { name: "Complete engagement" }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/contracts/c/complete"));
});
