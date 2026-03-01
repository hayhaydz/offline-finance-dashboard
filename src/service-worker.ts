/// <reference types="@sveltejs/kit" />
/// <reference types="@sveltejs/adapter-static" />

import { build, files, version } from "$service-worker";

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [...build, ...files];

// The service worker installation event
self.addEventListener("install", (event) => {
	// Create a new cache and add all files to it
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
	// Ignore GET requests for non-GET requests
	if (event.request.method !== "GET") return;

	async function respond() {
		const url = new URL(event.request.url);

		// Ignore non-http schemes (chrome-extension, ws, etc.)
		if (!url.protocol.startsWith("http")) {
			return fetch(event.request);
		}

		// Ignore Vite HMQ websocket
		if (url.protocol === "ws:" || url.protocol === "wss:") {
			return fetch(event.request);
		}

		const cache = await caches.open(CACHE);

		// Try to get from cache first
		const cached = await cache.match(event.request);

		// Serve from cache if available
		if (cached) return cached;

		// Otherwise fetch from network
		try {
			const response = await fetch(event.request);

			// Cache successful responses
			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch {
			// If network fails, try to serve from cache as fallback
			const cached = await cache.match(event.request);
			if (cached) return cached;

			// Otherwise return a basic offline response
			return new Response("Offline", {
				status: 503,
				statusText: "Service Unavailable",
			});
		}
	}

	event.respondWith(respond());
});
