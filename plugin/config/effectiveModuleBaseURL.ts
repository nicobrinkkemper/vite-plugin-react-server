import { getEnvValue } from "../env/getEnvKey.js";
import type { ResolvedUserOptions } from "../types.js";

/**
 * The single base-precedence chain: env override (deploy-time) > explicit
 * moduleBaseURL option (plugin-specific intent) > Vite's `config.base` (the
 * way every other plugin's consumer sets a base) > the option's "/" default.
 *
 * One function because the chain has to be applied in more than one place:
 * every sub-plugin resolves its OWN ResolvedUserOptions at factory time, so a
 * winner written back during one instance's config hook never reaches another
 * instance's copy. Each plugin whose copy feeds emission (worker env, edge
 * bake, bootstrapModules) must re-apply the chain against the resolved config
 * — with `moduleBaseURLExplicit` preserving the option-vs-default distinction
 * that makes config.base reachable at all.
 */
export function effectiveModuleBaseURL(
  userOptions: Pick<
    ResolvedUserOptions,
    "moduleBaseURL" | "moduleBaseURLExplicit"
  >,
  configBase: string | undefined,
  envPrefix: string
): string {
  const envBaseUrl = getEnvValue("BASE_URL", envPrefix);
  return envBaseUrl != null && envBaseUrl !== ""
    ? envBaseUrl
    : userOptions.moduleBaseURLExplicit
    ? userOptions.moduleBaseURL
    : typeof configBase === "string" && configBase !== ""
    ? configBase
    : userOptions.moduleBaseURL;
}
