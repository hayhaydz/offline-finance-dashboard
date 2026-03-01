import { sveltekit } from "@sveltejs/kit/vite"; // Import sveltekit plugin
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [sveltekit()], // Add sveltekit plugin
	test: {
		globals: true,
		environment: "node",
	},
});
