/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<import('./lib/db').Env>;

declare namespace App {
  interface Locals extends Runtime {
    user: import('./lib/auth').User | null;
    isAdmin: boolean;
    isGuest: boolean;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
