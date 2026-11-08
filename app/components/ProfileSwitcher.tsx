"use client";

import { ChildProfile, ProfileId } from "../lib/profiles";

export default function ProfileSwitcher({ active, family, onChange }: { active: ProfileId; family: ChildProfile[]; onChange: (profile: ProfileId) => void }) {
  return <div className={`profile-switcher ${family.length > 2 ? "profile-switcher-many" : ""}`} role="group" aria-label="Кто смотрит?">
    {family.map(child => <button type="button" key={child.id} className={`profile-tab profile-${child.id} profile-kind-${child.kind}`} aria-pressed={active === child.id} onClick={() => onChange(child.id)} data-testid={`profile-${child.id}`}>
      <span className="profile-avatar" aria-hidden="true">{child.avatar}</span>
      <span className="profile-name">{child.name}</span>
      {active === child.id && <span className="profile-check" aria-hidden="true">✓</span>}
    </button>)}
  </div>;
}
