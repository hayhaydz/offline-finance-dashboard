<script lang="ts">
	/**
	 * `?` help overlay (Phase 7): one place listing every keyboard
	 * shortcut. Terminal aesthetic — bordered panel, bracket close,
	 * monospace table. Opens via `?` (shift+/) or the header `[?]` link,
	 * closes on Escape or `[Close]`.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	const SHORTCUTS: Array<{ keys: string; action: string }> = [
		{ keys: "j / ↓", action: "next row in the focused list" },
		{ keys: "k / ↑", action: "previous row" },
		{ keys: "Enter", action: "open the selected row" },
		{ keys: "Esc", action: "clear the row selection" },
		{ keys: "?", action: "toggle this help" },
		{ keys: "⌘K", action: "command palette (jump + quick actions)" },
	];

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape" && open) {
			open = false;
			return;
		}
		if (
			event.key === "?" &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		) {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName ?? "";
			if (
				target?.isContentEditable ||
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				tag === "SELECT"
			) {
				return;
			}
			event.preventDefault();
			open = !open;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
		<div
			class="chart-panel max-w-md w-full"
			role="dialog"
			aria-label="Keyboard shortcuts"
		>
			<div class="chart-panel-title">
				<span>Keyboard shortcuts</span>
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => (open = false)}>[Close]</button
				>
			</div>
			<table class="w-full text-xs">
				<tbody>
					{#each SHORTCUTS as s (s.keys)}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="px-2 py-1 font-bold whitespace-nowrap">{s.keys}</td>
							<td class="px-2 py-1 text-gray-600">{s.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="chart-panel-summary">
				List navigation works on the accounts and goals lists — click a list
				first so it receives keys.
			</div>
		</div>
	</div>
{/if}
