"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import GoogleSignInButton, { GoogleSignInLink } from "./GoogleSignInButton";

export default function FamilyWelcome({ loading, unavailable, configured = true }: { loading: boolean; unavailable: boolean; configured?: boolean }) {
  const params = useSearchParams();
  const login = params.get("login");
  const notice = login === "not_invited"
    ? "New family registration is currently closed. If you have been invited, use the Google account that was added to your family."
    : login === "unavailable" ? "Google sign-in is temporarily unavailable. Please try again later."
    : login ? "We couldn't sign you in. Please try again and choose your Google account." : "";

  useEffect(() => {
    const previous = document.title;
    document.title = "Mira & Luke - Family sign in";
    return () => { document.title = previous; };
  }, []);

  return <main className="family-welcome" lang="en" data-testid="family-welcome" aria-busy={loading}>
    <header className="family-welcome-header">
      <a className="family-welcome-brand" href="/" aria-label="Mira and Luke home"><span className="family-welcome-logo" aria-hidden="true">🌳</span><span>Mira <em>&</em> Luke<small>Play. Learn. Grow.</small></span></a>
      <span className="family-welcome-header-note"><Sparkles aria-hidden="true" /> Made for little explorers</span>
    </header>
    <div className="family-welcome-layout">
      <section className="family-welcome-story" aria-labelledby="family-welcome-title">
        <p className="family-welcome-kicker"><span aria-hidden="true">✦</span> A world of little adventures</p>
        <h1 id="family-welcome-title">A little play.<br /><span>A lot of wonder.</span></h1>
        <p className="family-welcome-intro">Favorite cartoons, tiny games and happy discoveries.<br className="family-welcome-desktop-break" /> Come explore, one little adventure at a time.</p>
        <div className="family-welcome-playground">
          <span className="family-welcome-star star-one" aria-hidden="true">✦</span>
          <span className="family-welcome-star star-two" aria-hidden="true">✧</span>
          <span className="family-welcome-star star-three" aria-hidden="true">✦</span>
          <img className="family-welcome-heroes" src="/images/welcome/little-explorers.svg" width="1000" height="667" alt="A friendly tree symbol" fetchPriority="high" />
          <span className="family-welcome-sticker sticker-play"><span aria-hidden="true">🚙</span> Let’s play!</span>
          <span className="family-welcome-sticker sticker-grow"><span aria-hidden="true">🌟</span> Little wins, big smiles</span>
        </div>
        <ul className="family-welcome-features">
          <li><span aria-hidden="true">🎮</span> Playful learning</li>
          <li><span aria-hidden="true">🌱</span> Room to grow</li>
          <li><span aria-hidden="true">💜</span> Their own little space</li>
        </ul>
      </section>
      <section className="family-welcome-card" aria-labelledby="family-signin-title">
        <div className="family-welcome-card-icon" aria-hidden="true">🌈<span>✦</span></div>
        <h2 id="family-signin-title">Come on in!</h2>
        <p className="family-welcome-card-intro">Your family's next little adventure<br />starts right here.</p>
        <nav aria-label="Try games without an account" style={{display:"grid",gap:10,marginBottom:24}}>
          <strong>Try a game. No account needed.</strong>
          <a href="/games/mira-addition">Counting and addition</a>
          <a href="/games/huntrix-letters">Letters and names</a>
          <a href="/games/english-find">English listening</a>
          <a href="/games/car-people">Cars and matching</a>
          <small>Practice stays on this device.</small>
        </nav>
        {loading ? <p className="family-welcome-status" role="status">Checking your sign-in…</p>
          : unavailable ? <div className="family-welcome-status" role="alert"><p>We couldn't connect to sign-in. Please try again.</p><button className="family-welcome-retry" onClick={() => window.location.reload()}>Try again</button></div>
          : !configured ? <p className="family-welcome-status">Family accounts are not configured on this installation. You can play the practice games above.</p>
          : <div className="family-welcome-actions">
            <GoogleSignInButton testId="create-family" label="Create your family" />
            <p>Continue with Google. No new password.</p>
            <div className="family-welcome-divider"><span>Already playing with us?</span></div>
            <GoogleSignInLink className="family-welcome-login" testId="family-sign-in">Sign in to your family <ArrowRight aria-hidden="true" /></GoogleSignInLink>
          </div>}
        {notice && <p className="family-welcome-notice" role="alert">{notice}</p>}
        <div className="family-welcome-footnote"><Heart aria-hidden="true" /><p>Grown-ups sign in. Kids get to play.<br />No email or Google account needed for children.</p></div>
      </section>
    </div>
    <footer className="family-welcome-footer"><span>A little curiosity. A little magic. A whole lot of growing.</span><a href="/privacy">Privacy policy</a></footer>
  </main>;
}
