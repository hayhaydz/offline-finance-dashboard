<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { required, monetary } from '$lib/validation/rules';
	import SettingsSectionNav from '$lib/components/ui/settings-section-nav/settings-section-nav.svelte';

	let { data, form } = $props();

	// Form state - initialize from server data (pence to pounds)
	let monthlyExpenses = $state('');

	// Monthly expenses feedback
	let expensesMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Category state
	let showAddForm = $state(false);
	let editSlug = $state<string | null>(null);
	let categoryMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
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

	// DEBUG: trace createCategory form submission
	function handleAddSubmit() {
		console.log('[DEBUG:createCategory] Form submitting', { newName, newKey, newColour });
	}

	// Sync state when server data changes
	$effect(() => {
		monthlyExpenses =
			data.monthlyExpensesInPence !== null && data.monthlyExpensesInPence !== undefined
				? (data.monthlyExpensesInPence / 100).toFixed(2)
				: '';
	});

	// Validation rules for monthly expenses
	const validationRules = [
		required('Monthly expenses amount is required'),
		monetary('Enter amount like 2000 or 2000.00')
	];

	// Form field reference for validation
	let formFieldRef: {
		validate: () => boolean;
		touch: () => void;
	} | null = null;

	// Current value display
	const currentDisplay = $derived(
		data.monthlyExpensesInPence ? formatCurrency(data.monthlyExpensesInPence) : null
	);

	// Check if form is valid for submit button
	const isFormValid = $derived(() => {
		if (!formFieldRef) return false;
		return formFieldRef.validate();
	});

	const sections = [
		{ id: 'section-expenses', label: 'Expenses' },
		{ id: 'section-tax', label: 'Tax' },
		{ id: 'section-categories', label: 'Categories' }
	];
</script>

<main>
		<!-- HEADER -->
		<div class="flex justify-between items-center border-b border-black p-2 bg-gray-100">
			<span class="font-bold">GENERAL SETTINGS</span>
		</div>

		<SettingsSectionNav {sections} />

		<!-- MONTHLY EXPENSES CONFIGURATION SECTION -->
		<section id="section-expenses" style="scroll-margin-top: 2.5rem;">
			<div class="font-bold flex justify-between bg-gray-50 border-b border-gray-300 p-2">
				<span>Monthly Expenses Configuration</span>
			</div>

			<div class="p-4">
				<!-- Current value display -->
				{#if currentDisplay}
					<div class="mb-4 pb-4 border-b border-gray-300">
						<div class="flex justify-between my-1">
							<span><strong>Current monthly expenses:</strong></span>
							<span class="font-mono">{currentDisplay}</span>
						</div>
					</div>
				{/if}

				<!-- Help text -->
				<div class="mb-4">
					<h2 class="mt-0 mb-2">Monthly Essential Expenses</h2>
					<p class="text-sm mb-2">
						This amount is used to calculate Emergency Fund milestone targets:
					</p>
					<ul class="text-sm mb-2 ml-4">
						<li><strong>1 month:</strong> expenses / 12</li>
						<li><strong>3 months:</strong> expenses × 3 / 12</li>
						<li><strong>6 months:</strong> expenses × 6 / 12</li>
						<li><strong>12 months:</strong> expenses (full year)</li>
					</ul>
					<p class="text-sm mb-0">
						<strong>Example:</strong> If you spend £2,000/month, your 3-month emergency
						fund target is £6,000.
					</p>
				</div>

				<!-- Success message -->
				{#if expensesMessage?.type === 'success'}
					<p class="text-green-700 font-bold text-sm mb-4">
						{expensesMessage.text}
					</p>
				{/if}
				{#if expensesMessage?.type === 'error'}
					<p class="text-red-700 font-bold text-sm mb-4">
						{expensesMessage.text}
					</p>
				{/if}

				<!-- Form -->
				<form
					method="POST"
					action="?/saveMonthlyExpenses"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								expensesMessage = { type: 'success', text: 'Monthly expenses updated successfully.' };
							} else if (result.type === 'failure' && result.data) {
								const d = result.data as { error?: string };
								if (d.error) expensesMessage = { type: 'error', text: d.error };
							}
							await update();
						};
					}}
					class="mb-4"
				>
					<div class="mb-4">
						<FormField
							bind:this={formFieldRef}
							label="Monthly Essential Expenses (£)"
							name="monthlyExpenses"
							type="text"
							inputmode="numeric"
							placeholder="2000.00"
							bind:value={monthlyExpenses}
							rules={validationRules}
							filter={(value) => {
								// Allow only digits and decimal point
								return value.replace(/[^\d.]/g, '');
							}}
						/>
					</div>

					<button
						type="submit"
						class="bracket-link"
						disabled={expensesMessage?.type === 'success'}
						class:opacity-50={expensesMessage?.type === 'success'}
					>
						[Save Monthly Expenses]
					</button>
				</form>

				<!-- Info note -->
				<p class="text-xs text-gray-600 mt-4 mb-0">
					<strong>Note:</strong> This is a reference value only. Changing it does NOT
					retroactively update existing Emergency Fund goals (goal targets are set at
					creation time).
				</p>
			</div>
		</section>

		<!-- TAX SETTINGS SECTION -->
		<section id="section-tax" style="scroll-margin-top: 2.5rem;">
			<div class="font-bold flex justify-between bg-gray-50 border-t border-t-black border-b border-b-gray-300 p-2">
				<span>Tax Settings</span>
			</div>

			<div class="p-4">
				<!-- Current value display -->
				<div class="mb-4 pb-4 border-b border-gray-300">
					<div class="flex justify-between my-1">
						<span><strong>Current tax band:</strong></span>
						<span class="font-mono">
							{data.taxBand === 'basic' ? 'Basic Rate (£1,000 allowance)' :
								data.taxBand === 'higher' ? 'Higher Rate (£500 allowance)' :
								'Additional Rate (£0 allowance)'}
						</span>
					</div>
				</div>

				<!-- Help text -->
				<div class="mb-4">
					<h2 class="mt-0 mb-2">Personal Savings Allowance</h2>
					<p class="text-sm mb-2">
						Your tax band determines how much interest you can earn tax-free each year:
					</p>
					<ul class="text-sm mb-2 ml-4">
						<li><strong>Basic rate:</strong> £1,000 tax-free interest per year</li>
						<li><strong>Higher rate:</strong> £500 tax-free interest per year</li>
						<li><strong>Additional rate:</strong> £0 tax-free interest</li>
					</ul>
					<p class="text-sm mb-0">
						<strong>Note:</strong> ISA and LISA accounts are always tax-free and don't count
						toward your Personal Savings Allowance.
					</p>
				</div>

				<!-- Tax band form -->
				<form method="POST" action="?/updateTaxBand" class="mb-4">
					<div class="mb-4">
						<label for="taxBand" class="block text-sm font-bold mb-2">
							Select your tax band:
						</label>
						<select
							id="taxBand"
							name="taxBand"
							class="w-full border border-black px-2 py-1 bg-white max-w-md"
						>
							<option value="basic" selected={data.taxBand === 'basic'}>
								Basic Rate - £1,000 allowance
							</option>
							<option value="higher" selected={data.taxBand === 'higher'}>
								Higher Rate - £500 allowance
							</option>
							<option value="additional" selected={data.taxBand === 'additional'}>
								Additional Rate - £0 allowance
							</option>
						</select>
					</div>

					<button type="submit" class="bracket-link">
						[Save Tax Band]
					</button>
				</form>
			</div>
		</section>

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
				{#if categoryMessage}
					<div class="px-3 py-2 text-xs {categoryMessage.type === 'success' ? 'text-green-700' : 'text-red-700'} border-b border-gray-200">
						{categoryMessage.text}
					</div>
				{/if}

				<!-- Add form (shown when button clicked in banner) -->
				{#if showAddForm}
					<form
						method="POST"
						action="?/createCategory"
						onsubmit={handleAddSubmit}
						use:enhance={() => {
							console.log('[DEBUG:createCategory] use:enhance outer fn called');
							return async ({ result, update }) => {
								console.log('[DEBUG:createCategory] Result received', { type: result.type, data: result.type === 'failure' ? result.data : undefined });
								if (result.type === 'success') {
									categoryMessage = { type: 'success', text: 'Category created' };
									cancelAdd();
								} else if (result.type === 'failure' && result.data) {
									const d = result.data as { error?: string };
									console.log('[DEBUG:createCategory] Failure data', d);
									if (d.error) categoryMessage = { type: 'error', text: d.error };
								} else {
									console.log('[DEBUG:createCategory] Unhandled result type', result.type);
								}
								await update();
							};
						}}
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
												use:enhance={() => {
													return async ({ result, update }) => {
														if (result.type === 'success') {
															categoryMessage = { type: 'success', text: 'Category updated' };
															editSlug = null;
														} else if (result.type === 'failure' && result.data) {
															const d = result.data as { error?: string };
															if (d.error) categoryMessage = { type: 'error', text: d.error };
														}
														await update();
													};
												}}
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
											use:enhance={() => {
												return async ({ result, update }) => {
													if (result.type === 'success') {
														categoryMessage = { type: 'success', text: 'Category deleted.' };
													} else if (result.type === 'failure' && result.data) {
														const d = result.data as { error?: string };
														if (d.error) categoryMessage = { type: 'error', text: d.error };
													}
													await update();
												};
											}}
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
