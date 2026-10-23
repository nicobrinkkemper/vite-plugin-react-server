/**
 * The trailing argument every server action receives after its declared
 * ones. `platform` carries the runtime's extra handler arguments (workerd's
 * env and ctx; empty on Node and in dev). `refresh()` asks the client router
 * to refetch the current route once the action settles: call it from an
 * action that changed what pages render. A read, or a mutation whose caller
 * renders the returned value itself, leaves it uncalled and costs no refetch.
 *
 * Plain object, no request-scoped globals: every call gets its own.
 */
export type ServerActionContext = {
  platform: unknown[];
  refresh: () => void;
};

/** A fresh context for one action call, and whether it asked for a refresh. */
export const createServerActionContext = (platform: unknown[] = []) => {
  let refresh = false;
  const context: ServerActionContext = {
    platform,
    refresh: () => {
      refresh = true;
    },
  };
  return { context, refreshRequested: () => refresh };
};
