"use client";

import { useRouter } from "next/navigation";
import HuntrixSyllablesGame from "../../components/HuntrixSyllablesGame";

export default function HuntrixPage() {
  const router = useRouter();
  return <HuntrixSyllablesGame soundEnabled={true} onComplete={() => router.push("/")} />;
}
