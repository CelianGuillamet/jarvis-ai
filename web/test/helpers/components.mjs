import { build } from "esbuild";
import { compileScript, parse } from "@vue/compiler-sfc";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Compile the real Vue components for DOM tests using the existing Vite tooling.
export async function loadAccountComponents() {
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(resolve(root, "node_modules/.jarvis-tests-"));
  const outfile = resolve(directory, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { default as AuthGate } from './src/features/auth/AuthGate.vue';
      export { default as InboxZeroView } from './src/views/InboxZeroView.vue';
      export { default as TodayView } from './src/views/TodayView.vue';
      export { default as SettingsView } from './src/views/SettingsView.vue';
      export { usePreferencesStore } from './src/stores/preferencesStore.ts';
      export { useStatusStore } from './src/stores/statusStore.ts';
      export { useInboxZeroStore } from './src/stores/inboxZeroStore.ts';
      export { useAppStore } from './src/stores/appStore.ts';
      export { useChatStore } from './src/stores/chatStore.ts';
    `,
      resolveDir: root,
    },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["vue", "pinia", "zod", "vue-router"],
    alias: { "@": resolve(root, "src") },
    define: {
      "import.meta.env": JSON.stringify({
        VITE_API_BASE_URL: "https://api.example.test",
      }),
    },
    plugins: [
      {
        name: "vue-dom-test",
        setup(builder) {
          builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
            const { descriptor } = parse(await readFile(path, "utf8"), {
              filename: path,
            });
            const compiled = compileScript(descriptor, {
              id: path,
              inlineTemplate: true,
            });
            return {
              contents: compiled.content,
              loader: "ts",
              resolveDir: dirname(path),
            };
          });
        },
      },
    ],
  });
  return {
    modules: await import(pathToFileURL(outfile).href),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
