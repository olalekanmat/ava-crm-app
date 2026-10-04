# Ava CRM client test guide

All people and accounts below are fictional demo data.

## Two ways to test

**Demo (no setup):** on the sign-in screen tap a role under *Explore the demo*. Switch roles under *More*. The demo people are Tunde, Chioma, Kemi and Emeka (reps), Aisha Bello and David Mensah (FLMs), Michael Osei (SLM) and Grace Adeyemi (admin).

**A real test company:** needs the approval page deployed and Microsoft or Google sign-in registered (see SETUP.md). Then:
1. The client's admin signs in, taps *Set up a new company*, enters the company name and logo, pastes an empty OneDrive/SharePoint/Google Drive folder link (or creates one) and requests approval.
2. You approve it at avahealthcareltd.com/AvaCRM (Developer sign in).
3. The admin taps *Check now* under *Company & approval*, adds users (or imports them by CSV), sets tier names, and taps *Share folder with team*.
4. Each tester installs the APK, signs in with their own work account and opens the company.

## Things to try

**As a rep**
1. Today: see today's planned calls, drafts and "Behind plan" accounts.
2. Calls tab → *Calendar*: green edges are submitted calls, blue are planned and not yet due, red are planned calls whose day has passed. Tap a day to see its calls.
3. Open a planned call → *Record this call* → *Check in* (allow location) → pick products in the order presented → *Submit*. The check-in shows Verified or Off-site with the distance.
4. Plan tab: progress against the pace marker; open *Cycle 5* to build next cycle's plan from the suggestion, adjust calls per account, *Submit for approval*.
5. Accounts: filter by tier or "In my plan"; open an account without a location and *Pin my location*.

**As a first-line manager**
1. Team view: attainment vs. time elapsed, reach, geo-verified share for each rep.
2. Approve or send back the waiting plan (a note is required to send it back).
3. Team calls → *Check-in issues* to see off-site and missing check-ins.

**As a second-line manager**: compare the two teams, open a team, then a rep.

**As an admin**
1. Import CSV: download the accounts template, add rows, import; errors are shown per line before anything is saved.
2. Export data: calls with check-in coordinates and status, team KPIs, plans.
3. Tier names: rename the default ST/T1/T2/T3 or give one FLM's team its own names; accounts are renamed with them.
4. Company & approval: change the logo and see it at the top left of every page.
5. Cycles, products & rules: change the verified radius, require check-in, add a cycle or product.
6. Users & roles: add a rep under an FLM. In a real company they then sign in with that email's Microsoft or Google account; Ava stores no passwords.

## Feedback to collect
- Is the rep's daily flow fast enough to use between visits?
- Which KPIs do managers expect on the team view that are missing?
- Is hourly sync plus the Sync button enough, or do managers need changes sooner?
- Is the check-in rule (radius, mandatory or not) right for the client's compliance policy?
- Which fields does the client's account master data have that the import template lacks?
