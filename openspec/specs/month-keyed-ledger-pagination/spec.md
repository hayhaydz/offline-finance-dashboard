### Requirement: Account ledger paginates by whole months
The account detail ledger SHALL paginate by calendar month via `?month=YYYY-MM` such that a month's rows are never split across pages, and each page's month totals SHALL be computed server-side from the complete month range.

#### Scenario: Month totals are always complete
- **WHEN** a month contains 45 transactions and the user views that month's page
- **THEN** all 45 rows render on one page and the month header's inflow/outflow/net are computed from all 45 rows

#### Scenario: Default view
- **WHEN** the account detail page is opened without a month param
- **THEN** the most recent month with transactions is displayed

---

### Requirement: Ledger navigation moves between data-bearing months
Prev/next navigation SHALL move to the previous/next month containing at least one transaction (skipping empty months), and a month select built from data-bearing months SHALL allow direct jumps.

#### Scenario: Empty months are skipped
- **WHEN** March and June have transactions but April and May do not
- **THEN** clicking next from March lands on June

#### Scenario: Jump to arbitrary month
- **WHEN** the user picks a month from the month select
- **THEN** the ledger navigates to that month via the `?month=` URL param

---

### Requirement: Monthly summary and ledger share one navigation state
The monthly balance summary and the transaction ledger SHALL be driven by the same month parameter, so selecting a month in the summary navigates the ledger and vice versa.

#### Scenario: Summary click navigates ledger
- **WHEN** the user clicks a month in the monthly balance summary
- **THEN** the ledger shows that month without a full page architecture change (single param update)

---

### Requirement: Legacy page param is ignored
Legacy `?page=N` params carry no meaning under month-keyed pagination (user decision 2026-10-18: old URLs are dead) and SHALL be ignored — the page renders the default latest month.

#### Scenario: Legacy URL
- **WHEN** an account URL carries `?page=3`
- **THEN** the page renders the latest data-bearing month exactly as if no param were present
