## ADDED Requirements

### Requirement: The break-even month is marked in the debt projection table
The month-by-month debt projection table SHALL highlight the first row where cumulative interest paid equals or exceeds the original principal borrowed, for accounts where `originalPrincipal` is known.

#### Scenario: Break-even row is annotated when originalPrincipal is set
- **WHEN** `account.originalPrincipal` is non-null and non-zero, and the cumulative interest in any projection row reaches or exceeds `originalPrincipal`
- **THEN** that row is annotated with a marker: `← crossover: cumulative interest now exceeds original principal`

#### Scenario: Only the first crossover row is annotated
- **WHEN** the cumulative interest crosses the original principal threshold
- **THEN** only the first row where the crossover occurs is annotated; subsequent rows are not marked

#### Scenario: Break-even feature is hidden when originalPrincipal is null
- **WHEN** `account.originalPrincipal` is null (revolving debt, credit cards)
- **THEN** no break-even annotation is rendered in the projection table

#### Scenario: Break-even feature is hidden when crossover never occurs within the projection
- **WHEN** the cumulative interest across all projection rows never reaches `originalPrincipal`
- **THEN** no break-even annotation is rendered

#### Scenario: Break-even index is computed server-side
- **WHEN** the page data is loaded
- **THEN** `breakEvenMonthIndex` is computed in `+page.server.ts` as the first projection row index (0-based) where the running cumulative interest sum is ≥ `account.originalPrincipal`
