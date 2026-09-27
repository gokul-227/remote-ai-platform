import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./rap_kit";

describe("RichText (UX-03)", () => {
  it("renders headings, paragraphs and bullet lists from structured text", () => {
    const { container } = render(
      <RichText text={"We build tools.\n\nTHE ROLE\n\nYou will:\n- Design APIs\n- Ship & support\n\nApply today!"} />,
    );
    expect(container.querySelector("h4")?.textContent).toBe("THE ROLE");
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Design APIs",
      "Ship & support",
    ]);
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "We build tools.",
      "You will:",
      "Apply today!",
    ]);
  });

  it("shows markup-looking text as text, never as HTML", () => {
    const { container } = render(<RichText text={"a <img src=x onerror=alert(1)> b"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("keeps a legacy one-line description as one paragraph", () => {
    const long = "word ".repeat(300).trim() + ".";
    const { container } = render(<RichText text={long} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("h4")).toBeNull();
  });
});
