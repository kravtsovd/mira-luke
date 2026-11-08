
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);
const builtAt = new Date().toISOString().slice(0, 16).replace("T", " ");

/** @type {import('next').NextConfig} */
const nextConfig = {

  allowedDevOrigins: ["127.0.0.1"],

  distDir: process.env.MIRA_LUKE_PREVIEW === "1" ? "build/local-preview" : ".next",
  env: {
    NEXT_PUBLIC_BUILD: commit ? `${commit} · ${builtAt} UTC` : `${builtAt} UTC`,
  },
};

export default nextConfig;
