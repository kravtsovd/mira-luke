"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ChildProfile, isBuiltinProfile, KIND_LABELS, MAX_PROFILE_NAME, MAX_PROFILES, NEW_CHILD_KINDS, NewChildKind, PROFILE_AVATARS, ProfileId } from "../lib/profiles";
import type { ChildChangeResult } from "./useSharedProfiles";

interface Props {
  family: ChildProfile[];
  active: ProfileId;
  onCreate: (input: { name: string; avatar: string; kind: NewChildKind }) => Promise<ChildChangeResult>;
  onRename: (profile: ProfileId, change: { name?: string; avatar?: string }) => Promise<ChildChangeResult>;
  onDelete: (profile: ProfileId) => Promise<ChildChangeResult>;
  onSwitch: (profile: ProfileId) => void;
}
type Draft = { name: string; avatar: string; kind: NewChildKind };
const emptyDraft = (): Draft => ({ name: "", avatar: PROFILE_AVATARS[0], kind: "preschool" });

export default function ChildProfilesManager({ family, active, onCreate, onRename, onDelete, onSwitch }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProfileId | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ChildProfile | null>(null);

  const run = async (action: () => Promise<ChildChangeResult>, done: (result: ChildChangeResult) => void) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await action();
      if (result.error) setError(result.error); else done(result);
    } finally { setBusy(false); }
  };

  const avatarPicker = (value: string, onPick: (avatar: string) => void) => <div className="child-avatar-options" role="radiogroup" aria-label="Картинка">
    {PROFILE_AVATARS.map(avatar => <button type="button" key={avatar} role="radio" aria-checked={value === avatar} aria-label={avatar} onClick={() => onPick(avatar)}>{avatar}</button>)}
  </div>;

  return <section className="settings-section child-profiles" aria-labelledby="children-title" data-testid="child-profiles" inert={busy}>
    <h3 id="children-title">Дети</h3>
    <p>Профили общие для всех устройств семьи. У каждого ребёнка свои мультики, игры и настройки.</p>
    <ul className="child-profile-list">
      {family.map(child => <li key={child.id} data-testid={`child-row-${child.id}`}>
        {editing === child.id ? <form className="child-edit" onSubmit={event => { event.preventDefault(); void run(() => onRename(child.id, { name: draft.name, avatar: draft.avatar }), () => { setEditing(null); setMessage("Сохранено."); }); }}>
          <label>Имя<input value={draft.name} maxLength={MAX_PROFILE_NAME} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} data-testid="child-edit-name" required /></label>
          {avatarPicker(draft.avatar, avatar => setDraft(current => ({ ...current, avatar })))}
          <div className="child-actions"><button type="button" className="button button-quiet" onClick={() => setEditing(null)}>Отмена</button><button type="submit" className="button button-primary" data-testid="child-edit-save">Сохранить</button></div>
        </form> : <>
          <span className="child-avatar" aria-hidden="true">{child.avatar}</span>
          <span className="child-copy"><strong>{child.name}{child.id === active ? " · сейчас смотрит" : ""}</strong><span>{isBuiltinProfile(child.id) ? "Свои игры" : KIND_LABELS[child.kind as NewChildKind].title}</span></span>
          {!isBuiltinProfile(child.id) && (confirmDelete === child.id
            ? <span className="child-confirm" role="group" aria-label={`Удалить ${child.name}?`}>
              <span>Удалить {child.name}? Пропадут настройки и мультики, добавленные только для этого ребёнка.</span>
              <button type="button" className="button button-quiet" onClick={() => setConfirmDelete(null)}>Нет</button>
              <button type="button" className="button child-delete-confirm" data-testid={`child-delete-confirm-${child.id}`} onClick={() => void run(() => onDelete(child.id), () => { setConfirmDelete(null); setMessage(`${child.name}: профиль удалён.`); })}>Удалить</button>
            </span>
            : <span className="child-actions">
              <button type="button" className="icon-button" aria-label={`Изменить ${child.name}`} data-testid={`child-edit-${child.id}`} onClick={() => { setEditing(child.id); setConfirmDelete(null); setDraft({ name: child.name, avatar: (PROFILE_AVATARS as readonly string[]).includes(child.avatar) ? child.avatar : PROFILE_AVATARS[0], kind: "preschool" }); }}><Pencil aria-hidden="true" /></button>
              <button type="button" className="icon-button" aria-label={`Удалить ${child.name}`} data-testid={`child-delete-${child.id}`} onClick={() => { setConfirmDelete(child.id); setEditing(null); }}><Trash2 aria-hidden="true" /></button>
            </span>)}
        </>}
      </li>)}
    </ul>
    {adding ? <form className="child-add" data-testid="child-add-form" onSubmit={event => { event.preventDefault(); void run(() => onCreate(draft), result => { setAdding(false); setDraft(emptyDraft()); setCreated(result.child ?? null); setMessage(`${result.child?.name ?? draft.name}: профиль добавлен.`); }); }}>
      <label>Имя ребёнка<input value={draft.name} maxLength={MAX_PROFILE_NAME} autoFocus onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Например, Ваня" data-testid="child-name" required /></label>
      <fieldset><legend>Картинка</legend>{avatarPicker(draft.avatar, avatar => setDraft(current => ({ ...current, avatar })))}</fieldset>
      <fieldset><legend>Какие игры</legend><div className="child-kind-options" role="radiogroup" aria-label="Какие игры">
        {NEW_CHILD_KINDS.map(kind => <button type="button" key={kind} role="radio" aria-checked={draft.kind === kind} data-testid={`child-kind-${kind}`} onClick={() => setDraft(current => ({ ...current, kind }))}><strong>{KIND_LABELS[kind].title}</strong><span>{KIND_LABELS[kind].description}</span></button>)}
      </div></fieldset>
      <div className="child-actions"><button type="button" className="button button-quiet" onClick={() => { setAdding(false); setDraft(emptyDraft()); }}>Отмена</button><button type="submit" className="button button-primary" data-testid="child-create">{busy ? "Добавляем…" : "Добавить"}</button></div>
    </form> : family.length < MAX_PROFILES && <button type="button" className="button child-add-button" data-testid="child-add" onClick={() => { setAdding(true); setEditing(null); setConfirmDelete(null); setCreated(null); setDraft(emptyDraft()); }}><Plus aria-hidden="true" />Добавить ребёнка</button>}
    <p className="child-status" role="status">{message}{created && <> <button type="button" className="link-button" data-testid="child-switch-created" onClick={() => onSwitch(created.id)}>Включить профиль {created.name}</button></>}</p>
    {error && <p className="settings-validation" role="alert">{error}</p>}
  </section>;
}
