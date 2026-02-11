import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'node:fs';

const CERT = '/mnt/c/Users/Haydon/certs/localhost+2.pem';
const KEY = '/mnt/c/Users/Haydon/certs/localhost+2-key.pem';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
    // host: '127.0.0.1',
    // port: 5173,
    // strictPort: true,

    // https: {
    //   cert: fs.readFileSync(CERT),
    //   key: fs.readFileSync(KEY)
    // },

    // hmr: {
    //   clientPort: 5173,
    //   // if HMR misbehaves, add: host: 'localhost'
    // },
    
		watch: {
      // usePolling: true,
      // interval: 300,
			ignored: [
				'**/node_modules/@node-rs/**',
				'**/VERSION_HISTORY.md',
				'**/docs/**',
				'**/.planning/**',
				'**/*.log'
			]
		}
	}
});
