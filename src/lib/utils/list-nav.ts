/**
 * List navigation (Phase 7): j/k to move through `[data-nav-row]` rows,
 * Enter to open the row's primary link, Escape to clear. Pure decision
 * helper is separated from the DOM action for testability.
 */

export type ListNavDecision =
	| { type: "none" }
	| { type: "move"; index: number }
	| { type: "open" }
	| { type: "clear" };

/** Is this key event something list-nav should react to? Never hijack
 *  keys while typing in a field or with modifiers held. */
export function shouldHandleListNav(event: KeyboardEvent): boolean {
	if (event.metaKey || event.ctrlKey || event.altKey) return false;
	const target = event.target as HTMLElement | null;
	const tag = target?.tagName ?? "";
	if (
		target?.isContentEditable ||
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT"
	) {
		return false;
	}
	return true;
}

/** Decide what a keydown means for a list with `total` rows and the
 *  given selection. Movement clamps at the ends (no wrap — predictable
 *  for long ledgers). */
export function resolveListNav(
	event: KeyboardEvent,
	currentIndex: number | null,
	total: number,
): ListNavDecision {
	if (!shouldHandleListNav(event)) return { type: "none" };

	switch (event.key) {
		case "j":
		case "ArrowDown": {
			const next = currentIndex === null ? 0 : Math.min(currentIndex + 1, total - 1);
			return total > 0 ? { type: "move", index: next } : { type: "none" };
		}
		case "k":
		case "ArrowUp": {
			if (currentIndex === null) return total > 0 ? { type: "move", index: total - 1 } : { type: "none" };
			return { type: "move", index: Math.max(currentIndex - 1, 0) };
		}
		case "Enter":
			return currentIndex !== null ? { type: "open" } : { type: "none" };
		case "Escape":
			return currentIndex !== null ? { type: "clear" } : { type: "none" };
		default:
			return { type: "none" };
	}
}

/** The link a selected row opens: its `[data-nav-primary]` link if
 *  present, else the first anchor inside it. */
export function primaryLinkFor(row: HTMLElement): HTMLAnchorElement | null {
	return (
		row.querySelector<HTMLAnchorElement>("a[data-nav-primary]") ??
		row.querySelector<HTMLAnchorElement>("a[href]")
	);
}

/** Svelte action: make a container of `[data-nav-row]` elements
 *  keyboard-navigable. Rows get `.nav-selected` while selected. */
export function listnav(container: HTMLElement) {
	let selected: number | null = null;

	const rows = (): HTMLElement[] =>
		Array.from(container.querySelectorAll<HTMLElement>("[data-nav-row]"));

	const paint = () => {
		for (const [i, row] of rows().entries()) {
			const on = i === selected;
			row.classList.toggle("nav-selected", on);
			if (on) row.setAttribute("aria-current", "true");
			else row.removeAttribute("aria-current");
		}
	};

	const onKeydown = (event: Event) => {
		const list = rows();
		const decision = resolveListNav(event as KeyboardEvent, selected, list.length);
		if (decision.type === "none") return;
		event.preventDefault();

		if (decision.type === "move") {
			selected = decision.index;
			paint();
			list[selected]?.scrollIntoView({ block: "nearest" });
		} else if (decision.type === "open") {
			const link = selected !== null ? primaryLinkFor(list[selected]) : null;
			link?.click();
		} else if (decision.type === "clear") {
			selected = null;
			paint();
		}
	};

	container.addEventListener("keydown", onKeydown);
	// container needs focus to receive keys
	if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "0");
	// clicking anywhere in the list focuses it so j/k work immediately
	const onPointerDown = () => container.focus();
	container.addEventListener("pointerdown", onPointerDown);

	return {
		destroy() {
			container.removeEventListener("keydown", onKeydown);
			container.removeEventListener("pointerdown", onPointerDown);
		},
	};
}
