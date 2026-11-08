"use client";

import { useRouter } from "next/navigation";
import CarPeopleGame from "../../components/CarPeopleGame";

export default function CarPeoplePage() {
  const router = useRouter();
  return <CarPeopleGame soundEnabled onSolved={() => {}} onComplete={() => router.push("/")} />;
}
