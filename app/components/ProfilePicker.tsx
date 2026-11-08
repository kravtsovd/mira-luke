"use client";

import { useEffect, useRef } from "react";
import { ChildProfile, ProfileId } from "../lib/profiles";

export default function ProfilePicker({ family, onPick }: { family: ChildProfile[]; onPick: (profile: ProfileId) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return <div className="profile-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-picker-title" data-testid="profile-picker">
    <h2 id="profile-picker-title">Кто смотрит?</h2>
    <div className="profile-picker-grid">
      {family.map((child, index) => <button type="button" key={child.id} ref={index === 0 ? first : undefined} className={`profile-picker-card profile-kind-${child.kind}`} onClick={() => onPick(child.id)} data-testid={`pick-profile-${child.id}`}>
        <span className="profile-picker-avatar" aria-hidden="true">{child.avatar}</span>
        <strong>{child.name}</strong>
      </button>)}
    </div>
  </div>;
}
