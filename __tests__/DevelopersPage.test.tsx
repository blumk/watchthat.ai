import { render, screen } from "@testing-library/react";
import DevelopersPage from "@/app/developers/page";

// next/link renders a plain anchor in the test environment, which is fine.

describe("DevelopersPage", () => {
  it("renders the elevator-pitch headline", () => {
    render(<DevelopersPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /remembers the web/i }),
    ).toBeInTheDocument();
  });

  it("frames web monitoring as the first product on a broader platform", () => {
    render(<DevelopersPage />);
    expect(screen.getByText(/first product/i)).toBeInTheDocument();
    expect(screen.getByText(/built for more/i)).toBeInTheDocument();
  });

  it("renders the three audience cards", () => {
    render(<DevelopersPage />);
    expect(screen.getByText("For developers")).toBeInTheDocument();
    expect(screen.getByText("For agent builders")).toBeInTheDocument();
    expect(screen.getByText("For investors")).toBeInTheDocument();
  });

  it("renders the platform diagram", () => {
    render(<DevelopersPage />);
    expect(
      screen.getByRole("img", { name: /platform architecture/i }),
    ).toBeInTheDocument();
  });

  it("renders a primary contact CTA", () => {
    render(<DevelopersPage />);
    const cta = screen.getByRole("link", { name: /hello@watchthat\.app/i });
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute("href")).toMatch(/^mailto:hello@watchthat\.app/);
  });

  it("renders a link back to the consumer app", () => {
    render(<DevelopersPage />);
    expect(
      screen.getByRole("link", { name: /see the consumer app/i }),
    ).toBeInTheDocument();
  });
});
