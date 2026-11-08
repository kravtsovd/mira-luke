# Mira & Luke

Learning games and a parent-managed video library. Self-host with Next.js and React.

## Run locally

Use Node.js 22.13 or later. Node 22 LTS is recommended.

```sh
npm ci
npm run dev
```

Open http://localhost:3000/games/mira-addition for counting practice.
Open http://localhost:3000/games/huntrix-letters for letter practice.
Guest practice needs no keys or database. Its progress stays in this browser.
The home page requires a configured family account. It does not grant guest access to family data.

## Included

- Counting, colors, letters, syllables and matching games.
- Vehicle games, simple puzzles and English listening practice.
- Google parent sign-in and separate family accounts.
- An optional Supabase library, settings and game progress store.
- Optional YouTube search and parent-controlled library imports.
- A scoped API for a parent's own agent.

## Configure your own family deployment

Start with the variable names in `.env.example`. All example values are blank.
Create a separate Supabase project. Apply `supabase/schema.sql`, then the numbered migrations in order.
`supabase/seed.sql` contains only public YouTube video metadata. It contains no media files or viewing records.
The `demo` family is an empty compatibility namespace. No parent emails are enrolled by migrations.
New verified Google accounts create their own family. Set `SIGNUP_DISABLED=1` for invite-only use.
Set your Google OAuth callback to `https://YOUR_HOST/api/auth/google/callback`.
Use independent random secrets with at least 32 characters for both session secrets.
Never use another family's database, credentials or analytics project.
Keep service-role database keys on the server. Do not prefix them with `NEXT_PUBLIC_`.

YouTube search requires a signed-in parent and has a per-process burst limit.
Set provider quotas and a shared rate limit before scaling across server instances.
YouTube recommendation scraping is disabled unless explicitly enabled.

## Privacy and media

This release has fresh history. It excludes private deployment configuration, family email lists,
family pictures, viewing records, personal dashboards and vendor voice recordings.
Bundled graphics are simple SVG symbol cards. Emoji glyphs come from the viewer's system fonts.
No font files, third-party character images or downloaded video clips are bundled.
Some historical internal game IDs remain for compatibility.
Speech uses device/browser voices. Voice availability and offline support vary by device.
The browser or operating system may use a network voice service.

Analytics is disabled by default. Session recording is disabled in code.
Operators can opt into their own PostHog project using `NEXT_PUBLIC_ANALYTICS_ENABLED=true`.
Before inviting families, configure your own privacy contact, retention and deletion process.
The included privacy page describes the software defaults. It is not a legal compliance certification.
YouTube embeds and metadata remain subject to their providers' terms and availability.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm audit
```

## License

The source code and bundled SVG markup are available under the MIT license.
Dependencies retain their own licenses. System emoji fonts and external services are not relicensed.
See [LICENSE](LICENSE). Report security concerns privately using GitHub's security reporting feature.
