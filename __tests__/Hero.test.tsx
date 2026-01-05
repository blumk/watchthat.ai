import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";

describe("Hero", () => {
  it("renders the main headline text", () => {
    render(<Hero />);
    expect(screen.getByText(/know when websites/i)).toBeInTheDocument();
  });

  it("renders the 'change' gradient word", () => {
    render(<Hero />);
    expect(screen.getByText("change")).toBeInTheDocument();
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

  it("renders the ALWAYS WATCHING pill", () => {
    render(<Hero />);
    expect(screen.getByText(/always watching/i)).toBeInTheDocument();
  });
});
