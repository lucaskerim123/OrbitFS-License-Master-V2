import { execFileSync } from "node:child_process";

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const current = process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";

if (!previous) {
  process.exit(1);
}

let changed;
try {
  changed = execFileSync("git", ["diff", "--name-only", previous, current], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
} catch {
  // Build when Vercel cannot resolve the comparison rather than silently skipping code.
  process.exit(1);
}

const deployRelevant = (file) => /^(api|src|web|migrations|scripts)\//.test(file);
const shouldBuild = changed.some((file) =>
  deployRelevant(file) ||
  /^(package(-lock)?\.json|tsconfig\.json|vercel\.json|\.env\.example)$/.test(file),
);

// Vercel ignoreCommand exits 0 to skip a build and 1 to continue it.
process.exit(shouldBuild ? 1 : 0);
