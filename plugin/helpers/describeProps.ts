/**
 * A verbose-log-safe, one-line description of resolved props: their shape (a key
 * count), never their contents. Full props can be circular — React elements and
 * functions make `JSON.stringify` throw — and large enough to flood the log. A
 * `verbose` trace wants "did props resolve, and roughly how big", not a dump.
 */
export const describeProps = (p: unknown): string =>
  p && typeof p === "object"
    ? `${Object.keys(p as object).length} key(s)`
    : typeof p;
