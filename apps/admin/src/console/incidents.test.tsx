import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Incidents } from "./incidents";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api, ApiError: class extends Error {} }));
const item = { id: "one", title: "Imports delayed", service: "imports", description: "Queue backed up", severity: "SEV2", status: "OPEN", version: 1, created_at: "2026-11-14T12:00:00Z", assignee_id: null, resolved_at: null };
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string, options?: { method: string }) => {
    if (options?.method === "POST" || options?.method === "PATCH") return { data: item };
    if (path.includes("/activity")) return { data: [{ id: "event", action: "admin.incident.create", actor_id: "staff", created_at: item.created_at, payload: { reason: "Monitoring alert" } }] };
    if (path === "/admin/incidents/one") return { data: item };
    return { data: [item] };
  });
});
afterEach(cleanup);

describe("staff incidents", () => {
  it("loads detail and activity and submits versioned status changes with an audit reason", async () => {
    render(<Incidents writable />);
    fireEvent.click(await screen.findByRole("button", { name: "Imports delayed" }));
    await screen.findByText("Queue backed up");
    await screen.findByText("Monitoring alert");
    fireEvent.click(screen.getByRole("button", { name: "ACKNOWLEDGED" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "On call investigating" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/incidents/one", { method: "PATCH", json: { status: "ACKNOWLEDGED", version: 1, reason: "On call investigating" } }));
  });

  it("blocks mutations when the environment is read only and supports filters", async () => {
    render(<Incidents writable={false} />);
    expect((screen.getByRole("button", { name: "New incident" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "Imports delayed" }));
    await screen.findByText("Queue backed up");
    expect((screen.getByRole("button", { name: "ACKNOWLEDGED" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save assignment and severity" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add note" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "RESOLVED" } });
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/incidents?limit=25&offset=0&status=RESOLVED"));
  });

  it("creates incidents only after collecting the reason", async () => {
    render(<Incidents writable />);
    fireEvent.click(screen.getByRole("button", { name: "New incident" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Worker unavailable" } });
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "workers" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Heartbeat stale" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Monitoring alert" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/incidents", { method: "POST", json: { title: "Worker unavailable", service: "workers", description: "Heartbeat stale", severity: "SEV3", reason: "Monitoring alert" } }));
  });
});
