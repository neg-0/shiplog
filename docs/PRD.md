# ShipLog PRD v0.1

## Problem Statement

Teams ship code but struggle to communicate those changes to different stakeholders without manual rewriting. The same release needs to be explained differently to:

- **Customers** — Want to know what's new and how it benefits them
- **Developers** — Want technical details, breaking changes, migration steps
- **Stakeholders/Execs** — Want executive summary, shipped vs planned, business impact

Currently, teams either:
1. Paste raw GitHub changelogs (too technical for customers)
2. Manually rewrite 2-3 times (time-consuming)
3. Skip release notes entirely (customers miss value)

## Solution

ShipLog automatically generates three audience-specific versions of release notes from GitHub releases and distributes them to the right channels.

## User Stories (MVP)

### Setup (one-time)
- **US-1:** As a dev, I can connect my GitHub repo via OAuth in <2 minutes
- **US-2:** As a dev, I can configure which releases trigger generation
- **US-3:** As a dev, I can add Slack/Discord webhook URLs
- **US-4:** As a dev, I can add email addresses for stakeholder digests

### Runtime (automatic)
- **US-5:** When I publish a release, ShipLog generates 3 versions within 60 seconds
- **US-6:** ShipLog posts customer changelog to configured channels
- **US-7:** ShipLog posts dev changelog to configured channels
- **US-8:** ShipLog emails stakeholder brief to configured list
- **US-9:** ShipLog updates hosted changelog page

### Review (optional)
- **US-10:** I can view/edit generated notes before publishing
- **US-11:** I can regenerate with different tone/detail level

## Success Metrics

- Time from release to all channels notified: <60 seconds
- User setup time: <5 minutes
- Zero manual writing required after setup

## Out of Scope (MVP)

- Jira/Linear integration
- Multi-repo rollups
- Custom templates
- Approval workflows
- Analytics
- SSO/SAML
