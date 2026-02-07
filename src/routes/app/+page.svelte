<script lang="ts">
	import { page } from '$app/stores';
	let { data, locals } = $props();
</script>

<div class="app-container">
	<header>
		<div>
			<h1>Offline Finance Dashboard</h1>
			<p>Welcome, <strong>{locals.user?.username}</strong>! (User ID: {locals.user?.id})</p>
		</div>
		<nav>
			<form method="POST" action="/logout?/logout">
				<button type="submit">Log Out</button>
			</form>
		</nav>
	</header>

	<main>
		<section>
			<h2>Your Session</h2>
			<div class="info">
				<p><strong>Username:</strong> {locals.user?.username}</p>
				<p><strong>User ID:</strong> {locals.user?.id}</p>
				<p>
					<strong>Session created:</strong>
					{locals.session?.createdAt ? new Date(locals.session.createdAt).toLocaleString() : 'N/A'}
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
			<h2>Multi-User Security</h2>
			<p>
				This application supports multiple users with complete data isolation. Each user can only
				access their own data, enforced by row-level security.
			</p>
			<ul>
				<li>All database queries filter by <code>user_id</code></li>
				<li>Sessions are isolated per user</li>
				<li>Cross-user data access is blocked at the query layer</li>
			</ul>
		</section>

		<section>
			<h2>Phase 1 Complete</h2>
			<p>The Secure Foundation phase is complete. You can now:</p>
			<ul>
				<li>Register new users with username/password and TOTP MFA</li>
				<li>Log in with multi-factor authentication</li>
				<li>Maintain secure sessions with HTTP-only cookies</li>
				<li>Log out and invalidate sessions</li>
				<li>Experience complete data isolation between users</li>
			</ul>
			<p>
				<a href="/app/users">View Multi-User Demo</a>
				to see row-level security in action.
			</p>
			<p style="margin-top: 2rem;">
				<em>Next phases will add account management, net worth tracking, and more.</em>
			</p>
		</section>
	</main>
</div>

<style>
	.app-container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #ccc;
		padding-bottom: 1rem;
		margin-bottom: 2rem;
	}
	header h1 {
		margin: 0;
	}
	header p {
		margin: 0.5rem 0 0 0;
	}
	button {
		padding: 0.5rem 1rem;
		background: #000;
		color: #fff;
		border: none;
		cursor: pointer;
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
	ul {
		line-height: 1.6;
	}
	code {
		background: #f0f0f0;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: monospace;
	}
	a {
		color: #0066cc;
	}
</style>
