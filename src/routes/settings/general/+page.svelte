<script lang="ts">
	import { enhance } from '$app/forms';
	import { SettingsSectionNav } from '$lib/components/ui/index';
	import SubmitFeedback from '$lib/components/SubmitFeedback.svelte';
	import { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';

	let { data, form } = $props();

	// Form feedback composables
	const categoryFeedback = useSubmitFeedback();

	// Category state
	let showAddForm = $state(false);
	let editSlug = $state<string | null>(null);
	let newName = $state('');
	let newKey = $state('');
	let newColour = $state('#A0AEC0');

	function deriveKey(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.replace(/\s+/g, '_')
			.slice(0, 30);
	}

	function handleNameInput() {
		newKey = deriveKey(newName);
	}

	function startEdit(slug: string) {
		editSlug = editSlug === slug ? null : slug;
	}

	function cancelAdd() {
		showAddForm = false;
		newName = '';
		newKey = '';
		newColour = '#A0AEC0';
	}

	const sections = [
		{ id: 'section-categories', label: 'Categories' }
	];
</script>

<main>
		<!-- HEADER -->
		<div class="flex justify-between items-center border-b border-black p-2 bg-gray-100">
			<span class="font-bold">GENERAL SETTINGS</span>
		</div>

		<SettingsSectionNav {sections} />

	<!-- SPENDING CATEGORIES SECTION -->
	<section id="section-categories" style="scroll-margin-top: 2.5rem;">
		<div class="font-bold flex justify-between bg-gray-50 border-t border-t-black border-b border-b-gray-300 p-2">
			<span>SPENDING CATEGORIES ({data.categories.length})</span>
				{#if !showAddForm}
					<button onclick={() => (showAddForm = true)} class="bracket-link text-xs">
						Add Category
					</button>
				{/if}
			</div>

			<div class="p-0">
				<!-- Message -->
				<SubmitFeedback message={categoryFeedback.message} onDismiss={categoryFeedback.dismiss} />

				<!-- Add form (shown when button clicked in banner) -->
				{#if showAddForm}
					<form
						method="POST"
						action="?/createCategory"
						use:enhance={categoryFeedback.createEnhanceHandler('Category created', { onSuccess: cancelAdd })}
						class="px-3 py-2 border-b border-gray-300"
					>
						<div class="flex flex-wrap gap-2 items-end">
							<div>
								<label for="cat-name" class="block text-xs font-bold mb-1">Name</label>
								<input
									type="text"
									id="cat-name"
									name="name"
									bind:value={newName}
									oninput={handleNameInput}
									placeholder="e.g. Groceries"
									required
									class="border border-black px-2 py-1 text-sm font-mono w-36"
								/>
							</div>
							<div>
								<label for="cat-key" class="block text-xs font-bold mb-1">Key</label>
								<input
									type="text"
									id="cat-key"
									name="key"
									bind:value={newKey}
									placeholder="auto-derived"
									required
									class="border border-black px-2 py-1 text-sm font-mono w-28"
								/>
							</div>
							<div>
								<label for="cat-colour" class="block text-xs font-bold mb-1">Colour</label>
								<div class="flex items-center gap-1">
									<span
										class="inline-block w-4 h-4 border border-black"
										style="background-color: {newColour}"
									></span>
									<input
										type="text"
										id="cat-colour"
										name="colour"
										bind:value={newColour}
										placeholder="#3B82F6"
										required
										class="border border-black px-2 py-1 text-sm font-mono w-24"
									/>
								</div>
							</div>
							<button type="submit" class="bracket-link text-xs">Save</button>
							<button type="button" onclick={cancelAdd} class="bracket-link text-xs">Cancel</button>
						</div>
					</form>
				{/if}

				<!-- Category list -->
				{#if data.categories.length === 0}
					<p class="text-gray-600 text-xs p-3">No categories yet. Add one above.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th class="pl-3 text-left w-8">C</th>
								<th class="pl-3 text-left">Name</th>
								<th class="pl-3 text-left w-24">Key</th>
								<th class="text-right pr-3">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each data.categories as category}
								<tr class="border-b border-gray-200 last:border-b-0">
									<td class="pl-3 py-1">
										<span
											class="inline-block w-4 h-4 border border-black align-middle"
											style="background-color: {category.colour}"
										></span>
									</td>
									<td class="pl-3 py-1 text-sm">
										{#if editSlug === category.slug}
											<form
												method="POST"
												action="?/updateCategory"
												class="inline-flex gap-1 items-center"
												use:enhance={categoryFeedback.createEnhanceHandler('Category updated', { onSuccess: () => { editSlug = null; } })}
											>
												<input type="hidden" name="slug" value={category.slug} />
												<input
													type="text"
													name="name"
													value={category.name}
													class="border border-black px-1 py-0.5 text-xs font-mono w-28"
												/>
												<input
													type="text"
													name="colour"
													value={category.colour}
													class="border border-black px-1 py-0.5 text-xs font-mono w-20"
												/>
												<button type="submit" class="bracket-link text-xs">Save</button>
												<button
													type="button"
													onclick={() => (editSlug = null)}
													class="bracket-link text-xs"
												>Cancel</button>
											</form>
										{:else}
											{category.name}
										{/if}
									</td>
									<td class="pl-3 py-1 text-xs text-gray-500 font-mono">{category.key}</td>
									<td class="text-right pr-3 py-1">
										{#if editSlug !== category.slug}
											<button onclick={() => startEdit(category.slug)} class="bracket-link text-xs">
												Edit
											</button>
										{/if}
										<form
											method="POST"
											action="?/deleteCategory"
											use:enhance={categoryFeedback.createEnhanceHandler('Category deleted.')}
											class="inline"
										>
											<input type="hidden" name="slug" value={category.slug} />
											<button type="submit" class="bracket-link text-xs text-red-700">
												Delete
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>
	</main>
