import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy - Mira & Luke" };
export default function PrivacyPage() {
 return <main style={{maxWidth:720,margin:"40px auto",padding:24,fontFamily:"system-ui",lineHeight:1.7}}>
 <h1>Privacy in this self-hosted app</h1><p>The person running this deployment controls its data and services.</p>
 <h2>Local practice</h2><p>Guest practice stores progress in this browser. It does not connect to the original family or database.</p>
 <h2>Family accounts</h2><p>If configured, Google sign-in stores the parent’s email and family membership in the operator’s Supabase database. Child names, game settings and progress can also be stored there.</p>
 <h2>Optional services</h2><p>Analytics is off by default. Session recording is disabled. YouTube embeds contact Google when a video is opened. Device speech uses the browser’s voice service, which may depend on the device or operating system.</p>
 <h2>Deletion and contact</h2><p>Parents can remove child profiles in family settings. For account deletion, contact the operator of this deployment. Operators must provide their own contact details before inviting families.</p>
 <a href="/">Back to games</a></main>;
}
