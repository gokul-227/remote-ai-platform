import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "./rap_kit";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Apply to Northwind">
        <input aria-label="Cover note" />
        <button>Submit</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("is a labelled dialog that takes focus, closes on Escape and restores focus", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Apply to Northwind" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("textbox", { name: "Cover note" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const submit = screen.getByRole("button", { name: "Submit" });
    submit.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});
