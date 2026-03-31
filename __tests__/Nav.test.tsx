import { render, screen, fireEvent } from "@testing-library/react";
import Nav from "@/components/Nav";

describe("Nav", () => {
  it("renders the Watchthat brand name", () => {
    render(<Nav />);
    expect(screen.getByText("Watchthat")).toBeInTheDocument();
  });

  it("renders How it works link pointing to #how", () => {
    render(<Nav />);
    const link = screen.getByText("How it works");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#how");
  });

  it("renders Pricing link pointing to #pricing", () => {
    render(<Nav />);
    const link = screen.getByText("Pricing");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#pricing");
  });

  it("does not show My Watch List when hasSites is false", () => {
    render(<Nav hasSites={false} />);
    expect(screen.queryByText("My Watch List")).not.toBeInTheDocument();
  });

  it("shows My Watch List tab when hasSites is true", () => {
    render(<Nav hasSites={true} view="home" onSwitchView={jest.fn()} />);
    expect(screen.getByText("My Watch List")).toBeInTheDocument();
  });

  it("shows anchor links grayed out on watchlist view", () => {
    render(<Nav hasSites={true} view="watchlist" onSwitchView={jest.fn()} />);
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
  });

  it("calls onSwitchView with watchlist when My Watch List is clicked from home", () => {
    const onSwitchView = jest.fn();
    render(<Nav hasSites={true} view="home" onSwitchView={onSwitchView} />);
    fireEvent.click(screen.getByText("My Watch List"));
    expect(onSwitchView).toHaveBeenCalledWith("watchlist");
  });
});
