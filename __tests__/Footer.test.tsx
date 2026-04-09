import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer", () => {
  it("renders the footer tagline", () => {
    render(<Footer />);
    expect(
      screen.getByText("WatchThat – Web Change Monitor.")
    ).toBeInTheDocument();
  });

  it("renders a footer element", () => {
    const { container } = render(<Footer />);
    expect(container.querySelector("footer")).toBeInTheDocument();
  });
});
