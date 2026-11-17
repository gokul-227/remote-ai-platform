import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
import { JobApplyLink } from "./JobApplyLink";
afterEach(() => {
  auth.user = null;
  sessionStorage.clear();
});
it("sends guests to signup and remembers the intended job", () => {
  render(<JobApplyLink id="job-123" />);
  const link = screen.getByRole("link", { name: "Sign up to apply" });
  expect(link).toHaveAttribute("href", "/#register");
  fireEvent.click(link);
  expect(sessionStorage.getItem("rap-return-to")).toBe("jobdetail/job-123");
});
it("keeps the member job application route", () => {
  auth.user = { id: "member" };
  render(<JobApplyLink id="job-123" />);
  expect(screen.getByRole("link", { name: "View and apply" })).toHaveAttribute("href", "/#jobdetail/job-123");
});
