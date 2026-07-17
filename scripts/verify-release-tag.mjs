import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Refuse to publish a version that HEAD is not tagged for.
//
// The release flow tags manually, after the merge and before `npm publish`
// (`npm version` would tag the pre-merge commit on the branch, so it isn't used
// here). A manual step between two automated ones is the one that gets skipped:
// v3.1.7 shipped untagged and needed backfilling, and v3.1.9 nearly did. An
// untagged release is hard to undo — the version is immutable on npm, so the
// only repair is guessing which commit it was cut from.
//
// This runs from prepublishOnly, the last point where the mistake is still free
// to fix. Set VPRS_SKIP_TAG_CHECK=1 for the rare deliberate untagged publish.

// stderr is piped, not inherited: a missing tag makes git print its own
// "ambiguous argument" noise over the explanation this script is about to give.
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

if (process.env.VPRS_SKIP_TAG_CHECK === "1") {
  console.log("[verify-release-tag] VPRS_SKIP_TAG_CHECK=1 — skipping");
  process.exit(0);
}

const { version } = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
);
const tag = `v${version}`;

const fail = (problem, fix) => {
  console.error(`\n[verify-release-tag] ${problem}\n\n  ${fix}\n`);
  process.exit(1);
};

// Outside a checkout there is nothing to verify against — don't guess.
try {
  git("rev-parse", "--git-dir");
} catch {
  fail(
    "not a git repository, so the release tag can't be verified.",
    "Publish from a checkout, or set VPRS_SKIP_TAG_CHECK=1 if this is deliberate.",
  );
}

let tagged;
try {
  tagged = git("rev-list", "-n", "1", tag);
} catch {
  fail(
    `package.json is ${version}, but there is no ${tag} tag.`,
    `git tag -a ${tag} -m "${tag}" && git push origin ${tag}`,
  );
}

// An existing tag on some OTHER commit is the worse case: the publish would
// ship code the tag doesn't describe, and it reads as tagged forever after.
const head = git("rev-parse", "HEAD");
if (tagged !== head) {
  fail(
    `${tag} points at ${tagged.slice(0, 8)}, but HEAD is ${head.slice(0, 8)} — ` +
      `the tag does not describe what would be published.`,
    `Publish from ${tagged.slice(0, 8)}, or move the tag if it was cut from the wrong commit.`,
  );
}

console.log(`[verify-release-tag] ${tag} → ${head.slice(0, 8)} (HEAD)`);
