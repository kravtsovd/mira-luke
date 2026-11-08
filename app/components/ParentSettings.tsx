"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Car,
  Check,
  CircleDot,
  Hash,
  Palette,
  Play,
  Volume2,
  VolumeX,
  X,
  GalleryHorizontal,
  LayoutGrid,
  Rows2,
} from "lucide-react";
import {
  AppSettings,
  GameType,
  INTERVAL_OPTIONS,
  TEST_INTERVAL_MINUTES,
  MENU_LAYOUTS,
} from "@/app/lib/settings";

import type { ChildChangeResult, SettingsSaveResult } from "./useSharedProfiles";
import ChildProfilesManager from "./ChildProfilesManager";
import AccountSection from "./AccountSection";
import FamilyStats from "./FamilyStats";
import type { Account } from "./useAccount";
import { GAME_LABELS } from "../lib/game-labels";
import { availableGames, ChildProfile, NewChildKind, ProfileId } from "../lib/profiles";
import { NAME_CARDS } from "../lib/huntrix";
import { NameProgress, readNameProgress } from "../lib/huntrix-progress";
import { EnglishProgress, LEVELS, STARS_TO_PASS, readEnglishProgress } from "../lib/english-find";
import { loadSharedEnglishProgress } from "../lib/english-progress-sync";

interface ParentSettingsProps {
  profile: ProfileId;
  child: ChildProfile;
  family: ChildProfile[];
  onCreateChild: (input: { name: string; avatar: string; kind: NewChildKind }) => Promise<ChildChangeResult>;
  onRenameChild: (profile: ProfileId, change: { name?: string; avatar?: string }) => Promise<ChildChangeResult>;
  onDeleteChild: (profile: ProfileId) => Promise<ChildChangeResult>;
  onSwitchChild: (profile: ProfileId) => void;
  account: Account;
  onSignOut: () => void;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<SettingsSaveResult>;
  onTestGame: (type: GameType) => void;
}

const GAME_ICONS: Record<GameType, typeof BookOpen> = {
  "car-voices": Volume2,
  "car-workshop": Car,
  "car-hide": Car,
  "animal-voices": Volume2,
  "big-small": Car,
  "same-car": Car,
  "car-puzzle": Car,
  "mira-addition": Hash,
  "huntrix-letters": BookOpen,
  huntrix: BookOpen,
  "english-find": Volume2,
  cars: Car,
  "luke-count": Hash,
  "car-people": Car,
  letters: BookOpen,
  counting: Hash,
  colors: Palette,
  words: CircleDot,
  syllables: BookOpen,
};

export default function ParentSettings({
  profile,
  child,
  family,
  onCreateChild,
  onRenameChild,
  onDeleteChild,
  onSwitchChild,
  account,
  onSignOut,
  settings,
  onClose,
  onSave,
  onTestGame,
}: ParentSettingsProps) {
  const [draft, setDraft] = useState(settings);
  const [validationMessage, setValidationMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [nameProgress, setNameProgress] = useState<NameProgress>({});
  const [englishProgress, setEnglishProgress] = useState<EnglishProgress | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (profile !== "mira") return;
    setNameProgress(readNameProgress());
    setEnglishProgress(readEnglishProgress());
    let alive = true;
    void loadSharedEnglishProgress().then(shared => { if (alive && shared) setEnglishProgress(shared); });
    return () => { alive = false; };
  }, [profile]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  const toggleGame = (type: GameType) => {
    setValidationMessage("");
    setDraft((current) => {
      const isEnabled = current.enabledGames.includes(type);
      if (isEnabled && current.enabledGames.length === 1) {
        setValidationMessage("Оставьте включённой хотя бы одну игру.");
        return current;
      }

      return {
        ...current,
        enabledGames: isEnabled
          ? current.enabledGames.filter((game) => game !== type)
          : [...current.enabledGames, type],
      };
    });
  };

  const save = async () => {
    setSaving(true); setSaveError("");
    try {
      const result = await onSave(draft);
      if (result.error) {
        setSaveError(result.error);
        if (result.settings) setDraft(result.settings);
      } else onClose();
    } catch { setSaveError("Не удалось сохранить настройки. Попробуйте ещё раз."); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !saving) onClose();
    }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="settings-dialog">
        <header className="settings-header">
          <div>
            <p className="settings-kicker">Для взрослых</p>
            <h2 id="settings-title" ref={titleRef} tabIndex={-1}>Настройки · {child.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Закрыть настройки">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="settings-body" inert={saving}>
          <AccountSection account={account} onSignOut={onSignOut} />
          {account.signedIn && <FamilyStats family={family} active={profile} />}
          <ChildProfilesManager family={family} active={profile} onCreate={onCreateChild} onRename={onRenameChild} onDelete={onDeleteChild} onSwitch={onSwitchChild} />
          <fieldset className="settings-section">
            <legend>Как показывать мультики?</legend>
            <div className="menu-layout-options" role="radiogroup" aria-label="Вариант меню">
              {MENU_LAYOUTS.map(layout => {
                const Icon = layout === "feed" ? Rows2 : layout === "carousel" ? GalleryHorizontal : LayoutGrid;
                return <button type="button" role="radio" aria-checked={draft.menuLayout === layout} key={layout} onClick={() => setDraft(current => ({ ...current, menuLayout: layout }))} data-testid={`menu-layout-${layout}`}><Icon aria-hidden="true" /><strong>{layout === "feed" ? "Лента" : layout === "carousel" ? "Карусель" : "Плитки"}</strong><span>{layout === "feed" ? "Большие обложки" : layout === "carousel" ? "Листаем вбок" : "Больше на экране"}</span></button>;
              })}
            </div>
          </fieldset>
          <section className="settings-section">
            <div className="setting-row learning-setting-row"><div className="setting-copy"><h3>Игровые паузы</h3><p>Настройки {child.name} сохраняются на всех устройствах.</p></div><button type="button" role="switch" className={`switch ${draft.learningEnabled ? "on" : ""}`} aria-label="Игровые паузы" aria-checked={draft.learningEnabled} onClick={() => setDraft(current => ({ ...current, learningEnabled: !current.learningEnabled }))}><span /></button></div>
          </section>
          {profile === "mira" && <section className="settings-section" aria-labelledby="name-progress-title">
            <h3 id="name-progress-title">Как Мира собирает имена</h3>
            <p>После ошибок имя появляется чаще. Уверенно собранные имена появляются реже. Статистика хранится на этом устройстве.</p>
            <ul className="name-progress-list" data-testid="name-progress">
              {NAME_CARDS.map(card => {
                const result = nameProgress[card.id];
                return <li key={card.id}><strong>{card.name}</strong><span>{result ? `Без ошибок: ${result.perfect} из ${result.rounds}; ошибок: ${result.errors}` : "Ещё не играли"}</span></li>;
              })}
            </ul>
          </section>}
          {profile === "mira" && englishProgress && <section className="settings-section" aria-labelledby="english-progress-title">
            <h3 id="english-progress-title">Английский: Find it</h3>
            <p>Сейчас Level {englishProgress.level}{englishProgress.mastered ? " (вся ферма пройдена)" : ""}: звёзд {englishProgress.stars} из {STARS_TO_PASS}. Новая игра открывается за {STARS_TO_PASS} звезды. Раунд - три задания одной паузы. Считаются только паузы по таймеру. Прогресс общий для всех iPad и телефонов.</p>
            <ul className="name-progress-list" data-testid="english-progress">
              {LEVELS.map(({ level, title }) => {
                const stats = englishProgress.levels[level];
                const total = stats.clean + stats.miss;
                return <li key={level}><strong>Level {level}: {title}</strong><span>{total ? `Удачных раундов: ${stats.clean}, неудачных: ${stats.miss}` : "Ещё не играли"}</span></li>;
              })}
            </ul>
          </section>}
          {draft.learningEnabled && <>
          <fieldset className="settings-section">
            <legend>Когда делать паузу на игру?</legend>
            <p>Таймер идёт только пока мультфильм действительно проигрывается.</p>
            <div className="interval-options" data-testid="interval-options">
              {INTERVAL_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={`${draft.intervalMinutes === minutes ? "selected" : ""} ${minutes === TEST_INTERVAL_MINUTES ? "interval-test" : ""}`}
                  onClick={() => setDraft((current) => ({ ...current, intervalMinutes: minutes }))}
                  aria-pressed={draft.intervalMinutes === minutes}
                  data-testid={minutes === TEST_INTERVAL_MINUTES ? "interval-test-3-seconds" : `interval-${minutes}`}
                >
                  {minutes === TEST_INTERVAL_MINUTES ? <>3 сек<small>Для теста</small></> : <>{minutes}<small>мин</small></>}
                </button>
              ))}
            </div>
          </fieldset>

          <section className="settings-section" aria-labelledby="sound-setting-title">
            <div className="setting-row">
              <div className="setting-icon" aria-hidden="true">
                {draft.soundEnabled ? <Volume2 /> : <VolumeX />}
              </div>
              <div className="setting-copy">
                <h3 id="sound-setting-title">Голос заданий</h3>
                <p>Голос устройства. Доступные языки зависят от браузера.</p>
              </div>
              <button
                type="button"
                className={`switch ${draft.soundEnabled ? "on" : ""}`}
                role="switch"
                aria-checked={draft.soundEnabled}
                aria-label="Голос заданий"
                onClick={() => setDraft((current) => ({ ...current, soundEnabled: !current.soundEnabled }))}
                data-testid="sound-toggle"
              >
                <span />
              </button>
            </div>
          </section>

          <fieldset className="settings-section games-settings">
            <legend>Какие игры показывать?</legend>
            <p>Выберите набор или нажмите «Проверить», чтобы запустить игру сразу.</p>
            <div className="game-setting-list">
              {availableGames(profile, child.kind).map((type) => {
                const Icon = GAME_ICONS[type];
                const enabled = draft.enabledGames.includes(type);
                return (
                  <div className="game-setting-row" key={type}>
                    <button
                      type="button"
                      className={`game-checkbox ${enabled ? "checked" : ""}`}
                      onClick={() => toggleGame(type)}
                      aria-pressed={enabled}
                      aria-label={`${enabled ? "Выключить" : "Включить"} игру «${GAME_LABELS[type].title}»`}
                      data-testid={`game-toggle-${type}`}
                    >
                      {enabled && <Check size={18} aria-hidden="true" />}
                    </button>
                    <Icon className="game-setting-icon" aria-hidden="true" />
                    <div className="game-setting-copy">
                      <strong>{GAME_LABELS[type].title}</strong>
                      <span>{GAME_LABELS[type].description}</span>
                    </div>
                    <button
                      type="button"
                      className="test-game-button"
                      onClick={() => onTestGame(type)}
                      data-testid={`test-game-${type}`}
                    >
                      <Play size={16} fill="currentColor" aria-hidden="true" />
                      Проверить
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="settings-validation" role="alert">{validationMessage}</p>
          </fieldset>
          </>}
        </div>

        {saveError && <p className="settings-validation" role="alert" style={{ padding: "0 24px" }}>{saveError}</p>}
        <footer className="settings-footer">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={saving}>Отмена</button>
          <button type="button" className="button button-primary" onClick={save} disabled={saving} data-testid="save-settings">
            <Check size={20} aria-hidden="true" />
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </footer>
      </section>
    </div>
  );
}
