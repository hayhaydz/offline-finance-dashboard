import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		// layerchart ships raw .svelte source; Vite must compile it during SSR
		noExternal: ["layerchart"],
	},
	server: {
		watch: {
			ignored: [
				"**/node_modules/@node-rs/**",
				"**/.docs/VERSION_HISTORY.md",
				"**/docs/**",
				"**/.planning/**",
				"**/*.log",
				"**/CLAUDE.md",
			],
		},
	},
});
