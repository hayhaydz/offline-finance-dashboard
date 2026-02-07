<script lang="ts">
	import { withUserFilter } from '$lib/auth/row-security';
	import { db } from '$lib/db/client';
	import { users, sessions } from '$lib/db/schema';
	import { eq, count } from 'drizzle-orm';
	let { data, locals } = $props();

	// This demonstrates row-level security
	// Even though we query all users, we should only see our own data
	// In real usage, all queries would filter by user_id
</script>

<div class="app-container">
	<header>
		<h1>Multi-User Security Demo</h1>
		<a href="/app">&larr; Back to Dashboard</a>
	</header>

	<main>
		<section>
			<h2>Row-Level Security Demonstration</h2>
			<p>This page demonstrates that each user can only access their own data.</p>
		</section>

		<section>
			<h2>Your User Profile</h2>
			<div class="info">
				<p><strong>Username:</strong> {locals.user?.username}</p>
				<p><strong>User ID:</strong> {locals.user?.id}</p>
				<p>
					<strong>Account created:</strong>
					{locals.user?.createdAt ? new Date(locals.user.createdAt).toLocaleString() : 'N/A'}
				</p>
				<p><strong>Failed login attempts:</strong> {locals.user?.failedLoginAttempts || 0}</p>
			</div>
		</section>

		<section>
			<h2>Active Sessions</h2>
			<p>
				Your active sessions. Note that you can only see your own sessions, not sessions from
				other users.
			</p>
			<div class="info">
				<p><strong>Current session ID:</strong> {locals.session?.id}</p>
				<p>
					<strong>Session token:</strong> {locals.session?.token
						? locals.session.token.substring(0, 16) + '...'
						: 'N/A'}
				</p>
				<p>
					<strong>Last activity:</strong>
					{locals.session?.lastActivity
						? new Date(locals.session.lastActivity).toLocaleString()
						: 'N/A'}
				</p>
			</div>
		</section>

		<section>
			<h2>How Row-Level Security Works</h2>
			<ol>
				<li>
					<strong>Session validation:</strong> Every request validates the session token and
					populates <code>locals.user</code> with the user's ID.
				</li>
				<li>
					<strong>Query filtering:</strong> All database queries include a
					<code>where: eq(table.userId, locals.user.id)</code> clause.
				</li>
				<li>
					<strong>Access validation:</strong> After retrieving data, we verify
					<code>resource.userId === locals.user.id</code> before allowing access.
				</li>
				<li>
					<strong>Generic errors:</strong> Access attempts return generic "not found" errors
					instead of revealing that other users' data exists.
				</li>
			</ol>
		</section>

		<section>
			<h2>Testing Multi-User Isolation</h2>
			<p>To test row-level security:</p>
			<ol>
				<li>Register a second user (<a href="/register">/register</a>)</li>
				<li>Log in as the second user</li>
				<li>Notice you only see the second user's data</li>
				<li>Log out and log back in as the first user</li>
				<li>Notice you still only see the first user's data</li>
			</ol>
			<p class="warning">
				Users cannot access each other's data even if they guess URLs or IDs. Row-level
				security is enforced at the database query layer.
			</p>
		</section>
	</main>
</div>

<style>
	.app-container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}
	header {
		border-bottom: 1px solid #ccc;
		padding-bottom: 1rem;
		margin-bottom: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	header h1 {
		margin: 0;
	}
	section {
		margin-bottom: 2rem;
	}
	section h2 {
		margin-bottom: 0.5rem;
	}
	.info {
		background: #f5f5f5;
		padding: 1rem;
		border-radius: 4px;
		margin: 1rem 0;
	}
	.info p {
		margin: 0.25rem 0;
	}
	ol,
	ul {
		line-height: 1.8;
	}
	code {
		background: #f0f0f0;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: monospace;
	}
	.warning {
		background: #fff3cd;
		border-left: 4px solid #ffc107;
		padding: 1rem;
		margin: 1rem 0;
	}
	a {
		color: #0066cc;
	}
</style>
