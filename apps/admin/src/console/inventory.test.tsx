import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OperationsInventory } from "./inventory";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api, ApiError: class extends Error {} }));
afterEach(cleanup);

it("shows missing evidence explicitly and exposes only read navigation", async () => {
  api.mockResolvedValue({ data: {
    measured_at: "2026-11-14T12:00:00Z",
    services: [{ id: "admin", route_count: 2, status: "mounted" }],
    read_views: [{ name: "Usage", path: "/api/v1/admin/usage", screen: "usage" }],
    backup: { status: "evidence_unavailable", last_backup_at: null, last_restore_verified_at: null,
      reason: "No published run evidence.", runbook: "ops/backup/README.md",
      includes: ["Public schema"], excludes: ["Auth users and sessions"],
      required_evidence: ["Separate restore verification"] },
  } });
  render(<OperationsInventory />);
  await screen.findByText("Backup evidence unavailable");
  expect(screen.getByText(/Last evidenced backup: —/)).toBeTruthy();
  expect(screen.getByText(/Excluded: Auth users and sessions/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Usage" }).getAttribute("href")).toBe("#usage");
  expect(screen.getByRole("table", { name: "Mounted API domains" })).toBeTruthy();
  expect(api.mock.calls.every((args) => args.length === 1)).toBe(true);
});

it("reports fetch failure without presenting backup success", async () => {
  api.mockRejectedValue(new Error("offline"));
  render(<OperationsInventory />);
  await screen.findByText(/Network error/);
  expect(screen.queryByText("Backup evidence unavailable")).toBeNull();
});
