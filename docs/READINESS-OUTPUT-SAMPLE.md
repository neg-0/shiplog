# Synthetic output-quality check — 2026-09-20 UTC

This is a QA fixture, not a customer release or traction evidence. The existing OpenAI generator produced these drafts using only invented example material, with no private repository content. Model: `gpt-4o-mini`; final sample total input/output usage: 1799 tokens.

## Source

Tag v1.2.0, following v1.1.0. Added CSV export to the project list. Fixed duplicate project names appearing after refresh. Keyboard users can close the filter dialog with Escape. No measured performance, revenue, usage, or security improvement is claimed. No breaking API changes. Two synthetic commits describe these same changes; no pull requests or source URLs are supplied.

## Review

Earlier samples invented placeholder GitHub links and unsupported migration guidance. Prompt revisions now require complete source URLs and omit unsupported optional sections. In this final sample, each material change is supported, links are not fabricated, the developer references use the supplied synthetic commits, and no measured business outcome is invented. This single sample supports a pilot-quality observation only; human review remains required.

## Customer draft

## Release Notes for v1.2.0

This release introduces a new feature for exporting project lists and includes several important fixes for a smoother user experience.

### What's New
- Added the ability to export the project list as a CSV file, making it easier to manage and share project data.

### Improvements
- Keyboard users can now close the filter dialog using the Escape key for improved accessibility.

### Fixes
- Resolved an issue where duplicate project names appeared after refreshing the project list, ensuring a cleaner display of projects.

## Developer draft

## Release Notes for v1.2.0

### Summary
This release introduces a CSV export feature for the project list and addresses issues with duplicate project names and filter dialog handling.

### Features
- **CSV Export**: Added project-list CSV export.
  Commit: `1111111` - "Add project-list CSV export"

### Fixes
- **Duplicate Project Names**: Fixed an issue where duplicate project names appeared after refreshing the list.
  Commit: `2222222` - "Fix duplicate list items on refresh; restore filter dialog Escape handling"
- **Filter Dialog**: Keyboard users can now close the filter dialog using the Escape key.
  Commit: `2222222` - "Fix duplicate list items on refresh; restore filter dialog Escape handling"

### Breaking Changes
- No breaking API changes in this release.

## Stakeholder draft

# Release Notes for v1.2.0

## Executive Summary
In this release, we focused on enhancing user experience and functionality within the project list. Key improvements include the addition of CSV export capabilities and fixes for user interface issues. These changes aim to streamline project management tasks for users.

## Shipped Changes
- **CSV Export**: Added functionality to export the project list as a CSV file, facilitating easier data management and reporting.
- **Duplicate Project Names Fix**: Resolved an issue where duplicate project names appeared after refreshing the project list, improving clarity and usability.
- **Keyboard Navigation Improvement**: Enabled keyboard users to close the filter dialog using the Escape key, enhancing accessibility.

Signed by Example QA.
