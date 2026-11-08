import { Page } from "@playwright/test";
import { profileSettings, ProfileStore, restoreProfiles } from "../../../app/lib/profiles";

// Game/playback tests never write the family's shared preferences. Real database coverage lives in shared-settings.spec.ts.

export async function installProfileSettingsFixture(page: Page, initial: ProfileStore = restoreProfiles(null)) {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { signedIn: true, email: "parent@example.test", userName: "Parent", family: { id: "demo", name: "" }, googleConfigured: true } }));
  const rows = initial.profiles.map(child => ({ profile: child.id, name: child.name, avatar: child.avatar, kind: child.kind, revision: 1, settings: initial.settings[child.id] }));
  let created = 0;
  await page.unroute("**/api/profile-settings");
  await page.route("**/api/profile-settings", async route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      const row = rows.find(row => row.profile === body.profile)!;
      if (row.revision !== body.revision) return route.fulfill({ status: 409, json: { profiles: rows, error: "Newer settings" } });
      row.settings = body.settings; row.revision += 1;
      return route.fulfill({ json: { saved: row } });
    }
    await route.fulfill({ json: { profiles: rows } });
  });
  await page.unroute("**/api/profiles");
  await page.route("**/api/profiles", async route => {
    const method = route.request().method();
    const body = route.request().postDataJSON();
    if (method === "POST") {
      const profile = `c-test${String(++created).padStart(8, "0")}`;
      const settings = profileSettings(profile, undefined, body.kind);
      const row = { profile, name: body.name, avatar: body.avatar, kind: body.kind, revision: 1, settings };
      rows.push(row);
      return route.fulfill({ status: 201, json: { child: row } });
    }
    const index = rows.findIndex(row => row.profile === body.profile);
    if (index < 0) return route.fulfill({ status: 404, json: { error: "missing" } });
    if (method === "PATCH") { Object.assign(rows[index], body); return route.fulfill({ json: { child: rows[index] } }); }
    rows.splice(index, 1);
    return route.fulfill({ json: { deleted: body.profile } });
  });
  return rows;
}
