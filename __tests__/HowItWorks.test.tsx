import { render, screen } from "@testing-library/react";
import HowItWorks from "@/components/HowItWorks";

describe("HowItWorks", () => {
  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByText("How it works")).toBeInTheDocument();
  });

  it("renders all three step titles", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Paste a URL")).toBeInTheDocument();
    expect(screen.getByText("Snapshot taken")).toBeInTheDocument();
    expect(screen.getByText("Get alerted")).toBeInTheDocument();
  });

  it("renders step numbers 1, 2, 3", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders the section with id=how", () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector("#how")).toBeInTheDocument();
  });
});
