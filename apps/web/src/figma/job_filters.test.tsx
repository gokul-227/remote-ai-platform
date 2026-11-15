import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Filters } from "@/lib/jobFilters";
import { JobFilterChips, JobFilterPanel } from "./JobFilters";

function Harness({ initial = {} as Filters }) {
  const [f, setF] = useState<Filters>(initial);
  const [open, setOpen] = useState(false);
  const facets = {
    workplace: [
      { value: "remote", count: 40 },
      { value: "hybrid", count: 5 },
    ],
    apply: [{ value: "platform", count: 7 }],
  };
  return (
    <>
      <JobFilterChips value={f} onChange={setF} facets={facets} open={open} onOpen={setOpen} />
      <JobFilterPanel value={f} onChange={setF} facets={facets} total={45} open={open} onClose={() => setOpen(false)} />
      <output data-testid="state">{JSON.stringify(f)}</output>
    </>
  );
}

describe("job filter UI", () => {
  it("opens the panel, shows facet counts and applies a checkbox", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggleBtn = screen.getByRole("button", { name: "All filters" });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    await user.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Job filters" });
    expect(panel).toHaveAttribute("data-open", "true");
    const hybrid = screen.getByRole("checkbox", { name: /Hybrid/ });
    expect(hybrid.closest("label")).toHaveTextContent("5");
    await user.click(hybrid);
    expect(screen.getByTestId("state")).toHaveTextContent('{"workplace":["hybrid"]}');
    expect(screen.getByRole("button", { name: "All filters (1)" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(panel).toHaveAttribute("data-open", "false");
  });

  it("quick chips toggle and active chips remove; clear all resets", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ seniority: ["entry"] }} />);
    await user.click(screen.getByRole("button", { name: "Easy Apply (7)" }));
    expect(screen.getByRole("button", { name: "Easy Apply (7)" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Remove filter Entry level" }));
    expect(screen.getByTestId("state")).toHaveTextContent('{"apply":"platform"}');
    await user.click(screen.getAllByRole("button", { name: "Clear all" })[0]);
    expect(screen.getByTestId("state")).toHaveTextContent("{}");
  });
});
