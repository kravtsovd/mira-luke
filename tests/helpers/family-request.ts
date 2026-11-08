import { newSession, signValue } from "../../app/lib/auth";

// Route tests act as an authenticated parent rather than relying on anonymous family access.
export function familyRequest(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `ml_session=${encodeURIComponent(signValue(newSession("parent@example.test", "demo")))}`);
  return new Request(input, { ...init, headers });
}
