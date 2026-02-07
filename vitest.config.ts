import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite'; // Import sveltekit plugin

export default defineConfig({
	plugins: [sveltekit()], // Add sveltekit plugin
	test: {
		globals: true,
		environment: 'node'
	}
});
