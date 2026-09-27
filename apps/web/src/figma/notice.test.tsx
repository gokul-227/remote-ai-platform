import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Notice } from "./rap_kit";

describe("Notice", () => {
  it("keeps one live region mounted so each new message is announced", () => {
    const { rerender } = render(<Notice text="" onDismiss={() => {}} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    rerender(<Notice text="Application sent" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Application sent");
  });

  it("dismisses with a real button", () => {
    const onDismiss = vi.fn();
    render(<Notice text="Saved" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
