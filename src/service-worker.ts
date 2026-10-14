/// <reference types="@sveltejs/kit" />
/// <reference types="@sveltejs/adapter-static" />

import { build, files, version } from "$service-worker";

// $app/environment is not importable in service workers, so detect the dev
// server by the shape of the build manifest: dev bundles include vite-serve
// paths (/node_modules/, /@fs/, /.svelte-kit/), production builds only emit
// hashed /_app/ assets.
const IS_DEV_BUILD = build.some(
	(asset) =>
		asset.startsWith("/node_modules/") ||
		asset.startsWith("/@fs/") ||
		asset.startsWith("/.svelte-kit/"),
);

if (IS_DEV_BUILD) {
	// In development the service worker is actively harmful: it caches
	// compiled modules that go stale on every edit (HMR cannot get through
	// the cache), producing phantom hydration mismatches and stale UI.
	// Unregister and purge any caches left by previous registrations.
	self.addEventListener("install", () => {
		self.skipWaiting();
	});
	self.addEventListener("activate", (event) => {
		event.waitUntil(
			(async () => {
				for (const key of await caches.keys()) {
					await caches.delete(key);
				}
				await self.registration.unregister();
			})(),
		);
	});
} else {
	// Create a unique cache name for this deployment
	const CACHE = `cache-${version}`;

	// Only static build assets and public files are precached.
	// Dynamic responses (HTML pages, __data.json) are NEVER cached —
	// they contain live financial data and must come from the local server.
	const ASSETS = [...build, ...files].map(
		(asset) => new URL(asset, self.location.href).href,
	);
	const ASSET_URLS = new Set(ASSETS.map((url) => url.href));

	// Terminal-styled offline fallback, matching the app aesthetic.
	// Served when a navigation request fails because the local server is down.
	const OFFLINE_RESPONSE = new Response(
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OFFLINE</title>
<style>
	body { background: #fff; color: #000; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; display: flex; justify-content: center; }
	.box { max-width: 38rem; width: 100%; border-left: 1px solid #000; border-right: 1px solid #000; min-height: 100vh; }
	.bar { background: #000; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 12px; }
	.body { padding: 16px; font-size: 14px; }
	.msg { border: 1px solid #000; padding: 8px; margin-top: 12px; }
	.hint { color: #555; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<div class="box">
	<div class="bar">OFFLINE-FINANCE-v0.exe</div>
	<div class="body">
		<div class="msg">[!] SERVER UNREACHABLE [!]</div>
		<p class="hint">The local finance server is not responding. It may have stopped.</p>
		<p class="hint">Restart it with <code>npm run dev</code> (or <code>npm run start</code>) and reload.</p>
		<p class="hint">Your data is safe on disk — nothing was lost.</p>
	</div>
</div>
</body>
</html>`,
		{
			status: 503,
			statusText: "Service Unavailable",
			headers: { "Content-Type": "text/html; charset=utf-8" },
		},
	);

	// The service worker installation event
	self.addEventListener("install", (event) => {
		// Create a new cache and add all static files to it
		async function addFilesToCache() {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
		}

		event.waitUntil(addFilesToCache());
	});

	// The service worker activation event
	self.addEventListener("activate", (event) => {
		// Remove previous cached versions
		async function deleteOldCaches() {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
		}

		event.waitUntil(deleteOldCaches());
	});

	// The service worker fetch event
	self.addEventListener("fetch", (event) => {
		// Only handle GET requests
		if (event.request.method !== "GET") return;

		const url = new URL(event.request.url);

		// Ignore non-http schemes (chrome-extension, ws, etc.)
		if (!url.protocol.startsWith("http")) return;

		// Static assets only: serve from precache, fall back to network.
		if (ASSET_URLS.has(event.request.url)) {
			event.respondWith(
				caches
					.open(CACHE)
					.then((cache) => cache.match(event.request))
					.then((cached) => cached ?? fetch(event.request)),
			);
			return;
		}

		// Everything else (pages, data, API): always go to the network.
		// Never cache dynamic responses — financial data must be live.
		if (event.request.mode === "navigate") {
			// Navigations get the offline fallback when the server is down.
			event.respondWith(
				fetch(event.request).catch(() => OFFLINE_RESPONSE.clone()),
			);
		}
		// Non-navigation dynamic requests (e.g. __data.json) are left untouched
		// and fail naturally when offline.
	});
}
