## ADDED Requirements

### Requirement: Transaction ledger groups rows by calendar month with a net flow summary header
The transaction ledger SHALL group the currently displayed transactions by year-month and render a one-line summary header above each group showing the transaction count, total inflows, total outflows, and net flow for that month. Grouping is applied only within the current page (up to 20 transactions); no cross-page aggregation is required.

#### Scenario: Single month on page
- **WHEN** all visible transactions belong to the same calendar month
- **THEN** one month header is shown above all rows, displaying the month name, year, transaction count, and net flow summary

#### Scenario: Multiple months on page
- **WHEN** visible transactions span two or more calendar months
- **THEN** a month header is shown above each group, with each header summarising only the transactions in that group

#### Scenario: Month straddles page boundary
- **WHEN** a month's transactions are split across pagination pages
- **THEN** the summary header on each page reflects only the transactions visible on that page, with no cross-page aggregation

#### Scenario: Net flow summary content
- **WHEN** a month header is rendered
- **THEN** it displays in the format: `<Month> <Year> — <N> transactions · Net: <±£X> (£X in, £X out)`

#### Scenario: Net flow styling
- **WHEN** a month header is rendered
- **THEN** it uses `bg-gray-100` background consistent with other section header rows in the ledger

#### Scenario: Positive net shown in green
- **WHEN** the net flow for a month group is positive (more in than out)
- **THEN** the net figure is rendered in `text-green-700`

#### Scenario: Negative net shown in red
- **WHEN** the net flow for a month group is negative (more out than in)
- **THEN** the net figure is rendered in `text-red-700`

#### Scenario: Transaction with positive amount counted as inflow
- **WHEN** calculating group totals
- **THEN** transactions where `amount > 0` are summed as inflows; transactions where `amount < 0` are summed as outflows (absolute value)
