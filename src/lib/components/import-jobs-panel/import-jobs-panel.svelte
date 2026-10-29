<script lang="ts">
	/**
	 * Background import jobs (R22) — status table for the queue. Polls
	 * every 2s while any job is queued or running; settles to a static
	 * render otherwise. Payloads never leave the server; only counts,
	 * status and the first refusal error are shown.
	 */

	interface JobView {
		slug: string;
		kind: string;
		status: string;
		rowsTotal: number;
		errorMessage: string | null;
		resultCounts: {
			inserted: number;
			edited: number;
			deleted: number;
			skipped: number;
		} | null;
		createdAt: string;
		startedAt: string | null;
		finishedAt: string | null;
	}

	let jobs = $state<JobView[]>([]);
	let loaded = $state(false);
	let error = $state<string | null>(null);

	const active = $derived(
		jobs.some((j) => j.status === "queued" || j.status === "running"),
	);

	let timer: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		void poll();
		if (active) {
			timer = setInterval(() => void poll(), 2000);
		}
		return () => {
			if (timer !== undefined) clearInterval(timer);
			timer = undefined;
		};
	});

	async function poll() {
		try {
			const res = await fetch("/api/import-jobs");
			const data = await res.json();
			if (!res.ok) {
				error = data.error ?? "Poll failed";
				return;
			}
			error = null;
			jobs = data.jobs;
			loaded = true;
		} catch {
			error = "Poll failed — retrying";
		}
	}

	function shortSlug(slug: string): string {
		return slug.slice(0, 8);
	}

	function time(iso: string | null): string {
		return iso ? iso.slice(11, 19) : "—";
	}

	function statusClass(status: string): string {
		if (status === "done") return "text-green-700";
		if (status === "failed") return "text-red-700";
		return "text-amber-700";
	}
</script>

<div class="p-2 text-xs">
	<p class="text-gray-600 mb-2">
		Commits over ~1MB run here instead of blocking the form: the upload is
		accepted immediately, executed in the background, and reported with counts.
		Polls every 2s while work is in flight.
	</p>

	{#if error}
		<p class="text-red-700 mb-2">{error}</p>
	{/if}

	<div class="border border-black overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="bg-gray-100 border-b border-black">
					<th class="text-left px-1 py-0.5">Job</th>
					<th class="text-left px-1 py-0.5">Kind</th>
					<th class="text-left px-1 py-0.5">Status</th>
					<th class="text-right px-1 py-0.5">Rows</th>
					<th class="text-left px-1 py-0.5">Result</th>
					<th class="text-left px-1 py-0.5">Created</th>
					<th class="text-left px-1 py-0.5">Finished</th>
				</tr>
			</thead>
			<tbody>
				{#each jobs as job (job.slug)}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="px-1 py-0.5 font-mono" title={job.slug}>{shortSlug(job.slug)}</td>
						<td class="px-1 py-0.5 text-gray-600">{job.kind}</td>
						<td class="px-1 py-0.5 font-bold {statusClass(job.status)}">
							{job.status}{#if job.status === "queued" || job.status === "running"}…{/if}
						</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{job.rowsTotal || "—"}</td>
						<td class="px-1 py-0.5">
							{#if job.resultCounts}
								+{job.resultCounts.inserted} / ~{job.resultCounts.edited} / −{job.resultCounts.deleted} / ={job.resultCounts.skipped}
							{:else if job.errorMessage}
								<span class="text-red-700">{job.errorMessage}</span>
							{:else}
								<span class="text-gray-500">—</span>
							{/if}
						</td>
						<td class="px-1 py-0.5 tabular-nums text-gray-600">{time(job.createdAt)}</td>
						<td class="px-1 py-0.5 tabular-nums text-gray-600">{time(job.finishedAt)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="px-1 py-0.5 text-gray-500">
							{loaded ? "No import jobs yet — large commits queue here." : "Loading…"}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
