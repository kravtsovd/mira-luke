"use client";

import HuntrixSyllablesGame from "./HuntrixSyllablesGame";

export default function MiraHuntrix(props: { soundEnabled: boolean; onSolved?: () => void; onComplete: () => void }) {
  return <HuntrixSyllablesGame {...props} />;
}
