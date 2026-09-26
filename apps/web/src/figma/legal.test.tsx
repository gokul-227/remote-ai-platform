import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IMPRESSUM, PRIVACY, TERMS, pendingFacts } from "./legal_content";
import { Impressum, Privacy, Terms } from "./rap_pages";

describe("legal pages", () => {
  it.each([["Privacy Policy", Privacy], ["Terms of Service", Terms], ["Impressum", Impressum]])("%s has real content, not placeholder copy", (title, Page) => {
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/replace with your final legal copy|describes this section in plain language/i);
  });

  it("shows operator facts that have not been supplied as pending instead of inventing them", () => {
    render(<Impressum />);
    const missing = pendingFacts(IMPRESSUM);
    for (const f of missing) expect(screen.getByText(`Pending: ${f.label}.`)).toBeInTheDocument();
  });

  it("does not describe payments as processed or escrowed", () => {
    const text = JSON.stringify([PRIVACY, TERMS]);
    expect(text).toMatch(/Payments are not processed through Remote AI Platform/);
    expect(text).not.toMatch(/escrow/i);
  });
});
