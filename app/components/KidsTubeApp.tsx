"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pause, Play, Settings } from "lucide-react";
import LearningGame from "./LearningGame";
import CarGarageGame from "./CarGarageGame";
import CarPeopleGame from "./CarPeopleGame";
import ToddlerCarGame from "./ToddlerCarGame";
import { isToddlerCarGame } from "../lib/toddler-cars";
import { isLukeTapGame } from "../lib/luke-tap-games";
import LukeTapGame from "./LukeTapGame";
import CarPuzzleGame from "./CarPuzzleGame";
import MiraLearningGame from "./MiraLearningGame";
import MiraHuntrix from "./MiraHuntrix";
import EnglishFindGame from "./EnglishFindGame";
import LukeCountGame from "./LukeCountGame";
import ProfileSwitcher from "./ProfileSwitcher";
import ProfilePicker from "./ProfilePicker";
import ChildProfilesManager from "./ChildProfilesManager";
import WelcomeLibrary from "./WelcomeLibrary";
import YouTubeImportPicker from "./YouTubeImportPicker";
import useAccount, { Account } from "./useAccount";
import FamilyWelcome from "./FamilyWelcome";
import GoogleSignInButton from "./GoogleSignInButton";
import GameLauncher from "./GameLauncher";
import { setAnalyticsContext, track } from "../lib/analytics";
import { ProfileId, findChild, profileSettings, availableGames } from "../lib/profiles";
import ParentSettings from "./ParentSettings";
import { AccountBadge, StatsButton } from "./ParentActions";
import StatsDialog from "./StatsDialog";
import { useFullReports } from "./FullReportLinks";
import useSharedProfiles from "./useSharedProfiles";
import KidsCatalog from "./KidsCatalog";
import useNativeRecommendations from "./useNativeRecommendations";
import YouTubePlayer, { YouTubePlayerHandle } from "./YouTubePlayer";
import {
  CartoonVideo,
  getPlaybackId,
  getVideo,
  getVideosForProfile,
  isTopicId,
  VIDEOS,
} from "@/app/data/catalog";
import { chooseNextGame } from "@/app/lib/game-engine";
import { enterImmersiveMode, usesTouchViewport } from "@/app/lib/immersive";
import {
  AppSettings,
  GameType,
  isMenuLayout,
} from "@/app/lib/settings";

export default function KidsTubeApp() {
  const { account, loaded, error, signOut } = useAccount();
  if (!loaded || !account.signedIn || !account.family) {
    return <FamilyWelcome loading={!loaded} unavailable={error} configured={account.googleConfigured} />;
  }
  return <FamilyPlayer key={account.family.id} account={account} signOut={signOut} />;
}

function FamilyPlayer({ account, signOut }: { account: Account; signOut: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVideoId = searchParams.get("video");
  const [allCatalogVideos, setCatalogVideos] = useState<CartoonVideo[]>(VIDEOS);
  const catalogRevision = useRef(0);
  const onLibraryAdded = useCallback((video: CartoonVideo, savedProfile: ProfileId) => {
    track("library_video_added", { profile: savedProfile, video_id: video.id, topic: video.topicId });
    catalogRevision.current += 1;
    setCatalogVideos(current => {
      const previous = current.find(item => item.id === video.id);
      // Concurrent saves can return out of order; membership only grows through this action.
      const membership = previous && !previous.profiles?.length ? [] : [...new Set([...(previous?.profiles ?? []), ...(video.profiles ?? [])])];
      return [{ ...video, profiles: membership }, ...current.filter(item => item.id !== video.id)];
    });
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [manualGame, setManualGame] = useState(false);
  const { profiles, ready: profilesReady, notice: storageNotice, persist: persistProfiles, save: saveSharedSettings, createChild, renameChild, deleteChild } = useSharedProfiles(showSettings || !!activeGame, account.family!.id);
  const activeProfile = profiles.activeProfile;
  const activeChild = findChild(profiles, activeProfile);
  const kind = activeChild.kind;

  const carKid = kind === "luke" || kind === "toddler";

  const fullReports = useFullReports(account.signedIn);
  const statsHref = fullReports.includes("viewer.html") ? "/family/report/viewer.html" : undefined;
  const [loginNotice, setLoginNotice] = useState("");

  const emptyFamily = profilesReady && profiles.profiles.length === 0;

  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      try { sessionStorage.setItem("ml-welcome", "1"); } catch { /* private mode */ }
      const params = new URLSearchParams(searchParams.toString()); params.delete("welcome");
      window.history.replaceState(null, "", params.size ? `/?${params}` : "/");
    }
    try { setWelcome(sessionStorage.getItem("ml-welcome") === "1"); } catch { /* private mode */ }
  }, [searchParams]);
  const [youtubePicker, setYoutubePicker] = useState(false);
  useEffect(() => {
    const result = searchParams.get("youtube");
    if (!result) return;
    if (result === "ready") { setYoutubePicker(true); try { sessionStorage.removeItem("ml-welcome"); } catch { /* private mode */ } setWelcome(false); }
    else setLoginNotice(result === "denied" ? "Доступ к YouTube не дан. Можно попробовать ещё раз или поручить поиск своему ИИ-агенту." : result === "signin" ? "Сначала войдите с аккаунтом Google." : "Не получилось прочитать YouTube. Попробуйте ещё раз.");
    track("youtube_import_result", { result });
    const params = new URLSearchParams(searchParams.toString()); params.delete("youtube");
    window.history.replaceState(null, "", params.size ? `/?${params}` : "/");
  }, [searchParams]);
  const finishWelcome = () => { try { sessionStorage.removeItem("ml-welcome"); } catch { /* private mode */ } setWelcome(false); };
  const welcomeLibrary = welcome && account.signedIn && profilesReady && profiles.profiles.length > 0 && !showSettings;
  const needsChoice = profilesReady && !profiles.chosen && profiles.profiles.length > 2 && !showSettings && !activeGame;
  const liveProfile = useRef(activeProfile);
  liveProfile.current = activeProfile;
  const catalogVideos = useMemo(() => getVideosForProfile(activeProfile, allCatalogVideos), [allCatalogVideos, activeProfile]);
  const [selectedSessionVideo, setSelectedSessionVideo] = useState<CartoonVideo | null>(null);
  const knownVideo = getVideo(requestedVideoId, catalogVideos) ?? (selectedSessionVideo?.id === requestedVideoId ? selectedSessionVideo : undefined);

  const blockedVideo = requestedVideoId !== null && !knownVideo;
  const currentVideo = knownVideo ?? catalogVideos[0] ?? VIDEOS[0];
  const recommendations = useNativeRecommendations(currentVideo, catalogVideos, requestedVideoId !== null && !blockedVideo);

  const settings = useMemo(() => profileSettings(activeProfile, profiles.settings[activeProfile], kind), [activeProfile, profiles.settings, kind]);
  const quickGames = settings.enabledGames;
  const profileWatchTime = useRef<Record<ProfileId, number>>({});
  const [touchViewport, setTouchViewport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayVideoId, setAutoplayVideoId] = useState<string | null>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const playingRef = useRef(false);
  const previousGameRef = useRef<GameType | null>(null);
  const resumeAfterGameRef = useRef(false);
  const resumeAfterSettingsRef = useRef(false);
  const previewLayout = searchParams.get("menu");
  const menuLayout = isMenuLayout(previewLayout) ? previewLayout : settings.menuLayout;
  const requestedTopic = searchParams.get("theme");
  const initialTopic = isTopicId(requestedTopic) ? requestedTopic : undefined;

  useEffect(() => {
    const touchQuery = window.matchMedia("(any-pointer: coarse)");
    const update = () => setTouchViewport(usesTouchViewport());
    update();
    touchQuery.addEventListener("change", update);
    return () => touchQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => { setAnalyticsContext({ profile: activeProfile }); }, [activeProfile]);

  useEffect(() => {
    const result = searchParams.get("login");
    if (!result) return;
    const email = searchParams.get("email");
    setLoginNotice(result === "not_invited"
      ? `${email ?? "Этот аккаунт"} пока не добавлен ни в одну семью. Попросите родителя добавить его: «Для взрослых» → «Семья» → «Взрослые».`
      : result === "unavailable" ? "Вход через Google ещё не включён." : "Не получилось войти. Попробуйте ещё раз.");
    track("login_result", { result });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("login"); params.delete("email");
    window.history.replaceState(null, "", params.size ? `/?${params}` : "/");
  }, [searchParams]);

  const switchProfile = (profile: ProfileId) => {
    if (profile === activeProfile || !profilesReady) return;
    liveProfile.current = profile;
    playerRef.current?.pauseVideo();
    track("profile_switched", { from_profile: activeProfile, to_profile: profile });
    setAnalyticsContext({ profile });
    playingRef.current = false;
    setIsPlaying(false);
    setAutoplayVideoId(null);
    setActiveGame(null);
    setShowSettings(false);
    previousGameRef.current = null;
    resumeAfterGameRef.current = false;
    resumeAfterSettingsRef.current = false;
    setSelectedSessionVideo(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("video");
    params.delete("theme");
    window.history.replaceState(null, "", params.size ? `/?${params}` : "/");
    persistProfiles({ ...profiles, activeProfile: profile, chosen: true });
  };

  const pickProfile = (profile: ProfileId) => {
    track("profile_picked", { profile, children: profiles.profiles.length });
    if (profile === activeProfile) persistProfiles({ ...profiles, chosen: true });
    else switchProfile(profile);
  };

  // A read started before a save must not replace the freshly added item with an older snapshot.
  useEffect(() => {
    let active = true;
    const refreshCatalog = async () => {
      const revision = catalogRevision.current;
      try {
        const response = await fetch("/api/catalog", { cache: "no-store" });
        const payload = await response.json() as { items?: CartoonVideo[]; source?: string };
        if (active && (!response.ok || payload.source !== "database")) track("catalog_fallback", { http_status: response.status, source: payload.source ?? "unknown" });
        if (active && revision === catalogRevision.current && response.ok && payload.source === "database" && Array.isArray(payload.items)) {
          setCatalogVideos(payload.items);
        }
      } catch {
        if (active) track("catalog_fetch_failed");
        // Keep the bundled catalog available during a database or network outage.
      }
    };
    void refreshCatalog();
    const timer = window.setInterval(refreshCatalog, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {

    if (requestedVideoId !== null) setActiveGame(null);
    playingRef.current = false;
    setIsPlaying(false);
  }, [currentVideo.id, blockedVideo, requestedVideoId]);


  const handlePlayingChange = useCallback((playing: boolean) => {
    if (liveProfile.current !== activeProfile) return;
    playingRef.current = playing;
    setIsPlaying(playing);
  }, [activeProfile]);

  const handlePlayerReady = useCallback((player: YouTubePlayerHandle | null) => {
    playerRef.current = player;
  }, []);

  const startGame = useCallback((forcedType?: GameType, resumeOverride?: boolean) => {

    if (liveProfile.current !== activeProfile || !profilesReady) return;
    const game = forcedType ?? chooseNextGame(settings.enabledGames, previousGameRef.current);
    if (!availableGames(activeProfile, kind).includes(game)) return;
    resumeAfterGameRef.current = resumeOverride ?? playingRef.current;
    playerRef.current?.pauseVideo();
    playingRef.current = false;
    setIsPlaying(false);
    track("game_opened", { game, profile: activeProfile, trigger: forcedType ? "manual" : "watch_timer" });
    previousGameRef.current = game;
    setShowSettings(false);
    setManualGame(Boolean(forcedType));
    setActiveGame(game);
  }, [settings.enabledGames, activeProfile, profilesReady, kind]);

  const openSettings = useCallback(() => {
    track("settings_opened");
    resumeAfterSettingsRef.current = playingRef.current;
    playerRef.current?.pauseVideo();
    setShowSettings(true);
  }, []);

  const openStats = useCallback(() => {
    track("stats_opened");
    resumeAfterSettingsRef.current = playingRef.current;
    playerRef.current?.pauseVideo();
    setShowStats(true);
  }, []);

  const closeStats = useCallback(() => {
    setShowStats(false);
    if (resumeAfterSettingsRef.current) playerRef.current?.playVideo();
    resumeAfterSettingsRef.current = false;
  }, []);

  const closeSettings = useCallback(() => {
    track("settings_closed");
    setShowSettings(false);
    if (resumeAfterSettingsRef.current) playerRef.current?.playVideo();
    resumeAfterSettingsRef.current = false;
  }, []);

  const resumeAfterGame = useCallback(() => {
    if (liveProfile.current !== activeProfile) return;
    if (resumeAfterGameRef.current) playerRef.current?.playVideo();
    resumeAfterGameRef.current = false;
  }, [activeProfile]);

  const solveGame = useCallback(() => {
    if (liveProfile.current !== activeProfile) return;
    // Completing a game always returns to the cartoon, including games opened while paused.
    resumeAfterGameRef.current = true;
    resumeAfterGame();
  }, [resumeAfterGame, activeProfile]);

  const completeGame = useCallback(() => {
    if (liveProfile.current !== activeProfile) return;
    setActiveGame(null);
    resumeAfterGame();
  }, [resumeAfterGame, activeProfile]);

  const qaInterval = Number(searchParams.get("qaInterval"));
  const intervalSeconds =
    process.env.NODE_ENV !== "production" && Number.isFinite(qaInterval) && qaInterval > 0
      ? qaInterval
      : settings.intervalMinutes * 60;

  useEffect(() => {
    if (!profilesReady || !settings.learningEnabled || !isPlaying || activeGame || showSettings) return;
    const timer = window.setInterval(() => {
      profileWatchTime.current[activeProfile] = (profileWatchTime.current[activeProfile] ?? 0) + 1;
      if (profileWatchTime.current[activeProfile] >= intervalSeconds) {
        profileWatchTime.current[activeProfile] = 0;
        startGame();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeGame, intervalSeconds, isPlaying, startGame, settings.learningEnabled, activeProfile, profilesReady, showSettings]);

  const saveSettings = async (nextSettings: AppSettings) => {
    const safeSettings = profileSettings(activeProfile, nextSettings, kind);
    const result = await saveSharedSettings(activeProfile, safeSettings);
    if (result.error) return result;
    track("settings_saved", { menu_layout: safeSettings.menuLayout, learning_enabled: safeSettings.learningEnabled, interval_minutes: safeSettings.intervalMinutes, sound_enabled: safeSettings.soundEnabled });
    profileWatchTime.current[activeProfile] = 0;
    if (previewLayout) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("menu");
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
    return result;
  };

  const openVideo = (video: CartoonVideo) => {
    const allowedSessionSelection = video.source === "youtube-search" || recommendations.some(item => item.id === video.id) || selectedSessionVideo?.id === video.id;
    if (!getVideo(video.id, catalogVideos) && !allowedSessionSelection) return;
    track("video_selected", { video_id: getPlaybackId(video), video_title: video.title, channel: video.channel, topic: video.topicId, source: video.source ?? "catalog", recommended: recommendations.some(item => item.id === video.id), menu_layout: menuLayout });
    setSelectedSessionVideo(video);

    if (video.id === currentVideo.id && !blockedVideo && requestedVideoId !== null) playerRef.current?.playVideo();
    else if (!playerRef.current?.loadVideo(video.id)) setAutoplayVideoId(video.id);

    enterImmersiveMode();
    const params = new URLSearchParams({ theme: video.topicId, video: video.id });
    if (isMenuLayout(previewLayout)) params.set("menu", previewLayout);
    // Native history keeps the client component alive, so the explicit search-result grant is not lost while Next.js syncs useSearchParams with the new URL.
    window.history.pushState(null, "", `/?${params.toString()}`);
  };

  if (!profilesReady) return <div className="app-loading" role="status">Открываем вашу семью…</div>;

  return (
    <div className="app-shell kids-app" data-testid="app-root" data-profile={activeProfile} data-touch-device={touchViewport}>
      <header className="site-header" inert={!!activeGame || showSettings || showStats || needsChoice || emptyFamily || welcomeLibrary}>
        <div className="header-inner">
          <button type="button" className="brand kids-home-button" aria-label="Открыть меню мультфильмов" onClick={() => playerRef.current?.pauseVideo()}>
            <span className="brand-mark" aria-hidden="true"><Play fill="currentColor" /></span>
            {account.signedIn && account.family?.id !== "demo" && account.family?.name
              ? <span><strong>{account.family.name}</strong></span>
              : <span><strong>Мира</strong> и Люк</span>}
          </button>
          <div className="profile-tools" key={activeProfile}><ProfileSwitcher active={activeProfile} family={profiles.profiles} onChange={switchProfile} /><GameLauncher name={activeChild.name} games={quickGames} onStart={game => startGame(game)} /></div>
          {!account.signedIn && account.googleConfigured && <GoogleSignInButton testId="sign-in-header" compact />}
          {account.signedIn && <div className="header-parent-actions"><StatsButton onOpen={openStats} href={statsHref} onFollow={() => playerRef.current?.pauseVideo()} testId="stats-open-header" /><AccountBadge account={account} onOpen={openSettings} testId="account-badge-header" /></div>}
          <button
            type="button"
            className="header-settings"
            onClick={openSettings}
            aria-label="Для взрослых"
            data-testid="settings-open"
          >
            <Settings aria-hidden="true" />
            <span>Для взрослых</span>
          </button>
        </div>
      </header>

      {storageNotice && <p className="profile-storage-notice" role="status">{storageNotice}</p>}
      <main className="watch-only" data-testid="watch-screen" inert={!!activeGame || showSettings || showStats || needsChoice || emptyFamily || welcomeLibrary}>
        <section className="player-panel" aria-label={blockedVideo ? "Выбор мультфильма" : currentVideo.title}>
          {blockedVideo ? (
            <div className="player-frame" data-testid="video-not-approved" role="status">
              <div className="player-status">
                <strong>Этого видео нет в списке</strong>
                <span>Выбери мультфильм из списка.</span>
              </div>
            </div>
          ) : <YouTubePlayer key={activeProfile}
            videoId={getPlaybackId(currentVideo)}
            title={currentVideo.title}
            onPlayingChange={handlePlayingChange}
            onPlayerReady={handlePlayerReady}
            autoPlay={autoplayVideoId === currentVideo.id}
            initialMenu={requestedVideoId === null}
            renderPauseMenu={(ended, resume) => (
              <KidsCatalog profile={activeProfile} profileName={activeChild.name} signIn={account.signedIn ? <><StatsButton onOpen={openStats} href={statsHref} onFollow={() => playerRef.current?.pauseVideo()} /><AccountBadge account={account} onOpen={openSettings} /></> : account.googleConfigured ? <GoogleSignInButton /> : undefined} key={activeProfile} profileControls={<div className="profile-tools" key={activeProfile}><ProfileSwitcher active={activeProfile} family={profiles.profiles} onChange={switchProfile} /><GameLauncher name={activeChild.name} games={quickGames} onStart={game => startGame(game)} /></div>} onLibraryAdded={onLibraryAdded} catalogVideos={catalogVideos} currentVideo={currentVideo} recommendations={recommendations} layout={menuLayout} initialTopic={initialTopic} ended={ended} home={requestedVideoId === null} onResume={() => { resume(); enterImmersiveMode(); }} onSelect={openVideo} onSettings={openSettings} />
            )}
          />}
          {isPlaying && !activeGame && !showSettings && (
            <button type="button" className="button watch-pause" onClick={() => playerRef.current?.pauseVideo()} data-testid="watch-pause">
              <Pause size={20} aria-hidden="true" />
              Пауза
            </button>
          )}
        </section>

        <aside className="video-sidebar kids-watch-catalog" aria-label="Следующие мультфильмы">
          <KidsCatalog key={activeProfile} profile={activeProfile} profileName={activeChild.name} onLibraryAdded={onLibraryAdded} catalogVideos={catalogVideos} currentVideo={currentVideo} recommendations={recommendations} layout={menuLayout} initialTopic={initialTopic} compact onSelect={openVideo} />
        </aside>
      </main>

      {showSettings && (
        <ParentSettings
          profile={activeProfile}
          child={activeChild}
          family={profiles.profiles}
          onCreateChild={createChild}
          onRenameChild={renameChild}
          onDeleteChild={deleteChild}
          onSwitchChild={profile => { closeSettings(); switchProfile(profile); }}
          account={account}
          onSignOut={signOut}
          settings={{ ...settings, menuLayout }}
          onClose={closeSettings}
          onSave={saveSettings}
          onTestGame={(type) => {
            const shouldResume = resumeAfterSettingsRef.current;
            resumeAfterSettingsRef.current = false;
            startGame(type, shouldResume);
          }}
        />
      )}

      {showStats && <StatsDialog family={profiles.profiles} active={activeProfile} familyName={account.family?.name} onClose={closeStats} />}

      {needsChoice && <ProfilePicker family={profiles.profiles} onPick={pickProfile} />}
      {emptyFamily && !showSettings && <div className="family-onboarding" role="dialog" aria-modal="true" aria-labelledby="children-title" data-testid="family-onboarding"><div>
        <p className="settings-kicker">Шаг 1 из 2{account.family?.name ? ` · ${account.family.name}` : ""}</p>
        <h2>Добро пожаловать! Кто будет смотреть?</h2>
        <p>Добавьте детей. У каждого будут свои мультики, игры и настройки, а вы сможете переключаться между ними одним касанием.</p>
        <ChildProfilesManager family={[]} active="" onCreate={createChild} onRename={renameChild} onDelete={deleteChild} onSwitch={profile => switchProfile(profile)} />
        {account.signedIn && <p><button type="button" className="link-button" onClick={signOut}>Выйти ({account.email})</button></p>}
      </div></div>}
      {youtubePicker && <YouTubeImportPicker family={profiles.profiles} onClose={() => setYoutubePicker(false)} />}
      {welcomeLibrary && <WelcomeLibrary familyName={account.family?.name} youtubeImport={!!account.youtubeImport} onDone={finishWelcome} />}
      {loginNotice && <p className="login-notice" role="status" data-testid="login-notice">{loginNotice}<button type="button" className="link-button" onClick={() => setLoginNotice("")}>Понятно</button></p>}

      {}
      <p className="build-stamp" data-testid="build-stamp">{process.env.NEXT_PUBLIC_BUILD}</p>

      {activeGame && isToddlerCarGame(activeGame) && carKid ? (
        <ToddlerCarGame key={activeGame} type={activeGame} soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame && isLukeTapGame(activeGame) && carKid ? (
        <LukeTapGame key={activeGame} type={activeGame} soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "car-puzzle" && carKid ? (
        <CarPuzzleGame soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "cars" && carKid ? (
        <CarGarageGame soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "car-people" && carKid ? (
        <CarPeopleGame soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "luke-count" && carKid ? (
        <LukeCountGame soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : (activeGame === "mira-addition" || activeGame === "huntrix-letters") && kind === "mira" ? (
        <MiraLearningGame key={activeGame} skill={activeGame === "mira-addition" ? "addition" : "name-letters"} soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "huntrix" && kind === "mira" ? (
        <MiraHuntrix soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} />
      ) : activeGame === "english-find" && kind === "mira" ? (
        <EnglishFindGame soundEnabled={settings.soundEnabled} onSolved={solveGame} onComplete={completeGame} practice={manualGame ? {} : undefined} />
      ) : activeGame && !isToddlerCarGame(activeGame) && !isLukeTapGame(activeGame) && activeGame !== "car-puzzle" && activeGame !== "cars" && activeGame !== "car-people" && activeGame !== "huntrix" && activeGame !== "luke-count" && activeGame !== "english-find" && activeGame !== "mira-addition" && activeGame !== "huntrix-letters" && (
        <LearningGame
          key={`${activeGame}-${requestedVideoId ?? "practice"}`}
          type={activeGame}
          soundEnabled={settings.soundEnabled}
          onSolved={solveGame}
          onComplete={completeGame}
        />
      )}
    </div>
  );
}
