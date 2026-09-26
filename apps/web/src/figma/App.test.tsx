import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

describe("Figma Make app", () => {
  afterEach(() => { window.location.hash = ""; });

  it("renders the app shell on the default route", () => {
    render(<App />);
    expect(screen.getByRole("navigation", { name: /main navigation/i })).toBeInTheDocument();
  });

  it("renders the sign-in flow on #login", () => {
    window.location.hash = "#login";
    render(<App />);
    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });
});
