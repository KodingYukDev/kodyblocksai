import { fileURLToPath } from "node:url";

const pkg = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));
const dir = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/`, import.meta.url));

const names = ["engine", "renderer", "audio", "blocks-ui", "project", "ai", "ext-pen", "ext-music"] as const;

/** Alias @kody/<paket> -> packages/<paket>/src. Dipakai vite.config.ts dan vitest.config.ts. */
export const kodyAliases: { find: RegExp; replacement: string }[] = names.flatMap((n) => [
  { find: new RegExp(`^@kody/${n}$`), replacement: pkg(n) },
  { find: new RegExp(`^@kody/${n}/(.*)$`), replacement: `${dir(n)}$1` },
]);
