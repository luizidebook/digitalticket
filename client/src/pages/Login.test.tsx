// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

describe("Login page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders login mode by default and toggles to register", () => {
    render(<Login />);
    expect(screen.getByText("Acesse sua conta para continuar.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Nome completo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(screen.getByPlaceholderText("Nome completo")).toBeTruthy();
    expect(screen.getByText("Crie sua conta de comprador.")).toBeTruthy();
  });

  it("keeps submit disabled until email and 8-char password are present", () => {
    render(<Login />);
    const submit = () => screen.getAllByRole("button").find((el) => el.className.includes("w-full")) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("E-mail"), { target: { value: "buyer@test.local" } });
    fireEvent.change(screen.getByPlaceholderText("Senha"), { target: { value: "curta" } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Senha"), { target: { value: "senha-forte-123" } });
    expect(submit().disabled).toBe(false);
  });

  it("stores tokens and redirects on successful login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: "access-token-123",
      refreshToken: "refresh-token-456",
      user: { id: "u1", name: "Comprador", email: "buyer@test.local", role: "BUYER" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const location = { href: "" };
    Object.defineProperty(window, "location", { value: location, writable: true });

    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText("E-mail"), { target: { value: "buyer@test.local" } });
    fireEvent.change(screen.getByPlaceholderText("Senha"), { target: { value: "senha-forte-123" } });
    fireEvent.click(screen.getAllByRole("button").find((el) => el.className.includes("w-full"))!);

    await waitFor(() => expect(localStorage.getItem("digitalticket_access_token")).toBe("access-token-123"));
    expect(localStorage.getItem("digitalticket_refresh_token")).toBe("refresh-token-456");
    expect(location.href).toBe("/");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/login");
    expect(JSON.parse(String(init.body))).toMatchObject({ email: "buyer@test.local" });
  });

  it("shows a friendly error on invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "INVALID_CREDENTIALS" }), { status: 401 })));
    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText("E-mail"), { target: { value: "buyer@test.local" } });
    fireEvent.change(screen.getByPlaceholderText("Senha"), { target: { value: "senha-errada-1" } });
    fireEvent.click(screen.getAllByRole("button").find((el) => el.className.includes("w-full"))!);
    await waitFor(() => expect(screen.getByText("E-mail ou senha inválidos.")).toBeTruthy());
    expect(localStorage.getItem("digitalticket_access_token")).toBeNull();
  });
});
