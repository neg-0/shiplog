# Guide: Auto-Release Controls

## Overview
ShipLog allows you to control exactly when and where your changelogs are published. By default, new releases are automatically pushed to configured channels. You can toggle this behavior per channel.

## How It Works

1. **Navigate to Repository Settings:** Go to your dashboard and select a repository.
2. **Find the Channel:** Locate the Slack or Discord channel you want to modify.
3. **Toggle Auto-Publish:**
   - **ON (Default):** New GitHub releases are processed and immediately sent to this channel.
   - **OFF:** New releases are generated and saved as "Drafts" in ShipLog but are *not* sent to this channel. You can manually publish them later.

## Best Practices
- **Public Channels (#announcements):** Keep Auto-Publish **OFF** initially. Review the generated changelog, edit the "Customer" tone if needed, then manually publish.
- **Internal Channels (#dev-team):** Keep Auto-Publish **ON**. Your team benefits from immediate visibility into every release, even minor ones.

## FAQs
**Q: If I turn off auto-publish, is the changelog still generated?**
A: Yes! ShipLog still fetches the release, generates the notes using AI, and saves it to your dashboard. It just skips the "notify" step.

**Q: Can I publish to a specific channel later?**
A: Yes. In the Release Details page, click "Publish" and select the target channels.
