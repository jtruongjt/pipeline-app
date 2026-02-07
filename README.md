# Pipeline Analyzer

A lightweight, no-build web app for analyzing Salesforce pipeline CSV exports. Upload a CSV and explore metrics, stage totals, judgment funnel, walk-in pipeline by month, and a detailed opportunity table.

## Features
- CSV upload (client-side parsing)
- Filters: owner, stage, manager judgment, close date window, search
- Metrics: total assisted iARR, average deal size, median age, past due count
- Charts: stage totals, judgment funnel, walk-in and C&C pipe
- Table: opportunity details with past-due highlighting and missing next-step highlighting

## Usage
1. Open `index.html` in a browser.
2. Upload a Salesforce CSV export with the expected columns.

## Expected Columns
- `Opportunity Name`
- `Account Name`
- `Opportunity Owner`
- `Stage`
- `Manager Forecast Judgment`
- `Close Date`
- `Next Step Date`
- `Next Step`
- `Sales Notes`
- `Created Date`
- `Age`
- `Total Quota Relief`
- `Assisted iARR (New/Upgrade)`

## Notes
- Dates are parsed as `MM/DD/YYYY`.
- Currency values are summed and displayed with two decimals.
