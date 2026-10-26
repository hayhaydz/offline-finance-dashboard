# ui-polish Specification

## Purpose
TBD - created by archiving change ui-polish-svelte5. Update Purpose after archive.
## Requirements
### Requirement: Aesthetic tokens conform to the terminal style
The UI SHALL use monospace high-contrast styling with square borders, no rounded corners, no soft shadows (hard offset token only), amber (not yellow) for warnings, and semantic color classes for status only.

#### Scenario: Aesthetic sweep is enforceable
- **WHEN** the codebase is grepped for `rounded`, `text-yellow`, inline `text-shadow`, or arbitrary shadow classes
- **THEN** no live (imported) component matches

### Requirement: App code uses Svelte 5 idioms exclusively
Components SHALL use `$props()`/snippets/`$app/state`; legacy `export let`, `$page` stores, `<slot />`, and function-valued `$derived(() => fn)` anti-patterns SHALL NOT appear.

#### Scenario: Syntax sweep is enforceable
- **WHEN** the codebase is grepped for `export let`, `from '$app/stores'`, `<slot`, and `$derived(() =>`
- **THEN** no matches in src/

### Requirement: Shipped components are referenced
Every exported component and route SHALL be reachable from the app graph or removed.

#### Scenario: No dead UI surface
- **WHEN** component imports and route links are analyzed
- **THEN** every shipped component is imported and every route linked (or the route is deleted)

### Requirement: Interactive controls have accessible names
Icon-only buttons SHALL have `aria-label`; radio groups SHALL expose `role="radiogroup"` with a group label; inputs SHALL not rely on placeholders as labels.

#### Scenario: Screen reader announces close buttons
- **WHEN** a modal close button receives focus
- **THEN** it is announced as "Close modal" (not its glyph)

