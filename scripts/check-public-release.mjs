import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Session 01a1b8ab-0ef7-7830-beb4-c23c394d03cf: inspect only distributable files, never local credentials or build caches.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
  /AIza[0-9A-Za-z_-]{35}/,
  /(?:phx_|sb_secret_|sbp_)[A-Za-z0-9_-]{25,}/,
  /AKIA[A-Z0-9]{16}/,
  /eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}/,
];
const failures = [];
for (const file of files) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !/\.env\.(example|sample)$/.test(file)) {
    failures.push(`${file}: local environment file`);
    continue;
  }
  if (/\.(?:mp3|mp4|m4a|jpg|png|webp|woff2?|pem|key|session)$/i.test(file)) {
    failures.push(`${file}: excluded media or credential format`);
    continue;
  }
  const source = readFileSync(file, "utf8");
  if (rules.some(rule => rule.test(source))) failures.push(`${file}: potential credential (redacted)`);
  if (/^supabase\//.test(file) && /[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(source)) failures.push(`${file}: email enrollment`);
  if (/\.env\.(example|sample)$/.test(file) && /^(?:[A-Z_]*(?:KEY|TOKEN|SECRET))=.+$/m.test(source)) failures.push(`${file}: populated credential example`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ checkedFiles: files.length, potentialCredentials: 0, excludedMedia: 0, familyEmailEnrollment: 0 }));
