"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EnglishFindGame from "../../components/EnglishFindGame";
import type { LevelNumber } from "../../lib/english-find";

// Adult test page: /games/english-find?level=1..4. Always a practice run, so Mira's saved stars on this device stay as they are.
export default function EnglishFindPage() {
  const router = useRouter();
  const [level, setLevel] = useState<LevelNumber | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const asked = Number(new URLSearchParams(window.location.search).get("level"));
    setLevel(([1, 2, 3, 4].includes(asked) ? asked : 1) as LevelNumber);
  }, []);
  if (!level) return null;
  return <EnglishFindGame key={round} soundEnabled onSolved={() => {}}
    onComplete={() => { if (round > 200) router.push("/"); else setRound(value => value + 1); }}
    practice={{ level, onLevelChange: next => {
      setLevel(next);
      window.history.replaceState(null, "", `?level=${next}`);
    } }} />;
}
