import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";

describe("Hero", () => {
  it("renders 'We monitor' headline text", () => {
    render(<Hero />);
    expect(screen.getByText(/we monitor/i)).toBeInTheDocument();
  });

  it("renders 'so you don't have to' tagline", () => {
    render(<Hero />);
    expect(screen.getByText(/so you don.*t have to/i)).toBeInTheDocument();
  });

  it("renders the first rotating term by default", () => {
    render(<Hero />);
    expect(screen.getByText("websites")).toBeInTheDocument();
  });

  it("renders the URL input with correct placeholder", () => {
    render(<Hero />);
    expect(
      screen.getByPlaceholderText("https://example.com")
    ).toBeInTheDocument();
  });

  it("renders the Watch button", () => {
    render(<Hero />);
    expect(
      screen.getByRole("button", { name: /watch/i })
    ).toBeInTheDocument();
  });
});
