"use client";
import { useRouter } from "next/navigation";
import MiraLearningGame from "../../components/MiraLearningGame";
export default function Page(){const router=useRouter();return <MiraLearningGame skill="name-letters" soundEnabled={true} onComplete={()=>router.push("/")}/>;}
