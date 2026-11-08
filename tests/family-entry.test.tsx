// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import KidsTubeApp from "../app/components/KidsTubeApp";

const state = vi.hoisted(() => ({ loaded: true, error: false, account: { signedIn: false, family: null, googleConfigured: true }, signOut: vi.fn() }));
const profiles = vi.hoisted(() => vi.fn(() => { throw new Error("Family profiles must not mount before sign-in"); }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../app/components/useAccount", () => ({ default: () => state }));
vi.mock("../app/components/useSharedProfiles", () => ({ default: profiles }));
afterEach(() => { cleanup(); state.loaded = true; state.error = false; state.account.googleConfigured = true; profiles.mockClear(); });

it("offers registration and returning sign-in without mounting family profiles", () => {
  localStorage.setItem("mira-luke-profiles-v1", JSON.stringify({ profiles: [{ id: "mira", name: "Private child" }] }));
  render(<KidsTubeApp />);
  expect(screen.getByRole("link", { name: "Create your family" }).getAttribute("href")).toBe("/api/auth/google");
  expect(screen.getByTestId("family-sign-in").getAttribute("href")).toBe("/api/auth/google");
  expect(screen.queryByText("Private child")).toBeNull();
  expect(profiles).not.toHaveBeenCalled();
  localStorage.clear();
});
it("waits for identity before offering entry or reading profiles", () => {
  state.loaded = false;
  render(<KidsTubeApp />);
  expect(screen.getByRole("status").textContent).toBe("Checking your sign-in…");
  expect(screen.queryByTestId("create-family")).toBeNull();
  expect(profiles).not.toHaveBeenCalled();
});
it("offers local games when this installation has no Google configuration", () => {
  state.account.googleConfigured = false;
  render(<KidsTubeApp />);
  expect(screen.getByText(/Family accounts are not configured/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Counting and addition" }).getAttribute("href")).toBe("/games/mira-addition");
  expect(screen.queryByTestId("create-family")).toBeNull();
  expect(profiles).not.toHaveBeenCalled();
});
it("shows a retry when the session check fails instead of opening a cached family", () => {
  state.error = true;
  render(<KidsTubeApp />);
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByTestId("create-family")).toBeNull();
  expect(profiles).not.toHaveBeenCalled();
});
