<script lang="ts">
	import { withUserFilter } from '$lib/auth/row-security';
	import { db } from '$lib/db/client';
	import { users, sessions } from '$lib/db/schema';
	import { eq, count } from 'drizzle-orm';
	let { data } = $props();

	// This demonstrates row-level security
	// Even though we query all users, we should only see our own data
	// In real usage, all queries would filter by user_id
</script>

<div class="max-w-[800px] mx-auto p-8">
	<header class="border-b border-gray-300 pb-4 mb-8 flex justify-between items-center">
		<h1 class="m-0">Multi-User Security Demo</h1>
		<a href="/app">&larr; Back to Dashboard</a>
	</header>

	<main>
		<section class="mb-8">
			<h2 class="mb-2">Row-Level Security Demonstration</h2>
			<p>This page demonstrates that each user can only access their own data.</p>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">Your User Profile</h2>
			<div class="bg-gray-50 p-4 rounded my-4">
				<p class="my-1"><strong>Username:</strong> {data.user?.username}</p>
				<p class="my-1"><strong>User ID:</strong> {data.user?.id}</p>
				<p class="my-1">
					<strong>Account created:</strong>
					{data.user?.createdAt ? new Date(data.user.createdAt).toLocaleString() : 'N/A'}
				</p>
				<p class="my-1"><strong>Failed login attempts:</strong> {data.user?.failedLoginAttempts || 0}</p>
			</div>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">Active Sessions</h2>
			<p>
				Your active sessions. Note that you can only see your own sessions, not sessions from
				other users.
			</p>
			<div class="bg-gray-50 p-4 rounded my-4">
				<p class="my-1"><strong>Current session ID:</strong> {data.session?.id}</p>
				<p class="my-1">
					<strong>Session token:</strong> {data.session?.token
						? data.session.token.substring(0, 16) + '...'
						: 'N/A'}
				</p>
				<p class="my-1">
					<strong>Last activity:</strong>
					{data.session?.lastActivity
						? new Date(data.session.lastActivity).toLocaleString()
						: 'N/A'}
				</p>
			</div>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">How Row-Level Security Works</h2>
			<ol class="leading-relaxed">
				<li>
					<strong>Session validation:</strong> Every request validates the session token and
					populates <code class="bg-gray-100 p-1 px-2 rounded font-mono">data.user</code> with the user's ID.
				</li>
				<li>
					<strong>Query filtering:</strong> All database queries include a
					<code class="bg-gray-100 p-1 px-2 rounded font-mono">where: eq(table.userId, data.user.id)</code> clause.
				</li>
				<li>
					<strong>Access validation:</strong> After retrieving data, we verify
					<code class="bg-gray-100 p-1 px-2 rounded font-mono">resource.userId === data.user.id</code> before allowing access.
				</li>
				<li>
					<strong>Generic errors:</strong> Access attempts return generic "not found" errors
					instead of revealing that other users' data exists.
				</li>
			</ol>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">Testing Multi-User Isolation</h2>
			<p>To test row-level security:</p>
			<ol class="leading-relaxed">
				<li>Register a second user (<a href="/register" class="text-blue-600 underline">/register</a>)</li>
				<li>Log in as the second user</li>
				<li>Notice you only see the second user's data</li>
				<li>Log out and log back in as the first user</li>
				<li>Notice you still only see the first user's data</li>
			</ol>
			<p class="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
				Users cannot access each other's data even if they guess URLs or IDs. Row-level
				security is enforced at the database query layer.
			</p>
		</section>
	</main>
</div>
