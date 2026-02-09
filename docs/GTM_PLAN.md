# ShipLog Go-To-Market (GTM) Strategy

> Status: DRAFT for Board Review
> Version: 1.0.0
> Date: 2026-02-08

## 🚢 The Mission
Transition ShipLog from a "cool tool" to a "mission-critical" part of the developer workflow. We win by being the easiest way to keep everyone (Devs, Stakeholders, Customers) in sync without adding a single minute of manual work to the team.

---

## 🚀 Launch Phase: "The Hyper-Activation"

### 1. Launch Channels
We aren't just launching once; we are launching where our customers live.

- **Product Hunt (Day 1):** Focus on the "AI-powered audience adaptation" angle. 
    - *Angle:* "Stop writing three versions of the same changelog."
- **Reddit (r/reactjs, r/webdev, r/saas):** Focus on the automation and GitHub integration.
    - *Angle:* "I built a tool that writes my release notes for me so I can get back to coding."
- **Hacker News:** Show, don't tell. A simple, fast-loading public changelog page of ShipLog itself.
- **Directories:** Submit to `indiehackers`, `betalist`, and `alternativeTo` (targeting Headway, Beamer, and ReleaseNotes.io).

### 2. Content Strategy: "Show the Magic"
Visual proof of the AI's "brains" is our best closer.

- **Loom "Workflow" Series:**
    - *The 1-Minute Connect:* Show how easy it is to go from OAuth to a full history import.
    - *The Audience Toggle:* Show the same release transformed for a Customer vs. a CTO.
- **Twitter (X) Threads:**
    - "Why your changelog is your best marketing tool (and why you're ignoring it)."
    - "Automating the most hated part of my dev workflow with ShipLog."
- **LinkedIn:** Focus on the "Stakeholder Alignment" value prop for VPs of Engineering and Product Leads.

---

## 🎯 "First 10 Customers" Acquisition Plan
We don't need a thousand users yet; we need 10 who *depend* on ShipLog.

1. **Direct Outreach (The "Early Access" Hook):**
   - Identify 50 active OSS maintainers or small SaaS founders on GitHub.
   - DM/Email with a personal compliment on their recent release + a link to a *pre-generated* ShipLog page for their repo (using our backfill tool).
   - "Hey, I love [Project]. I generated this changelog for you using ShipLog—took 10 seconds. Want the account for free for 6 months to keep it updated?"

2. **The "Powered By" Viral Loop:**
   - Every free public changelog includes a "Powered by ShipLog" badge.
   - Ensure the public page is SEO-optimized for "[Company] Changelog" so it appears in search results.

3. **Incentivized Feedback:**
   - Offer a lifetime "Founding Member" 50% discount to the first 10 users who complete a 15-minute feedback call.

---

## 🛠 Backlog Attack: The "MVP Complete" Sprint
To be "Launch Ready," we must close these gaps immediately:

### 1. Public SEO & Polish (Priority: HIGH)
- [ ] **Slug generation:** Auto-generate unique, clean slugs for public pages (e.g., `shiplog.io/c/acme-api`).
- [ ] **SEO Meta Tags:** Ensure public pages have correct OpenGraph tags for Twitter/LinkedIn previews.
- [ ] **Powered-by Toggling:** Fix logic so only Team users can hide the branding.

### 2. Activation Experience (Priority: HIGH)
- [ ] **Auto-Import on Connect:** Offer to import the last 5 releases automatically during the connection flow to avoid the "empty dashboard" problem.
- [ ] **Live Preview:** Allow users to see the generated notes *before* they hit "Publish" to Slack/Discord.

### 3. Distribution Hardening (Priority: MEDIUM)
- [ ] **Manual Retry:** Add a "Resend to Channel" button for failed distributions.
- [ ] **Email Digest:** Basic "Weekly Summary" email for stakeholders.

---

## 📈 Success Metrics (First 30 Days)
- **Activation:** 50 repositories connected with at least 5 historical releases imported.
- **Engagement:** 10 "Manual Edits" (proves people care about the content quality).
- **Revenue:** First 3 paying (Pro) customers.

---

**Captain 🚢**
*CEO, ShipLog*
