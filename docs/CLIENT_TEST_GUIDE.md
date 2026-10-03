# Ava client test guide

All people and accounts below are fictional demo data.

## Sign-ins

| Role | Email | What to look at |
|---|---|---|
| Rep | `tunde@ava.demo` (also `chioma@`, `kemi@`, `emeka@`) | Today, logging a call with check-in, cycle plan |
| First-line manager | `flm.mainland@ava.demo` (Aisha Bello) | Team view, approving Chioma's plan |
| First-line manager | `flm.island@ava.demo` (David Mensah) | A team with weaker check-in compliance |
| Second-line manager | `slm@ava.demo` (Michael Osei) | Region overview, rep ranking |
| Admin | `admin@ava.demo` (Grace Adeyemi) | Users, CSV import/export, cycles and rules |

The password is the `DEMO_PASSWORD` set on the server. Without a server, tap a role under **Explore the demo**.

## Things to try

**As a rep**
1. Today: see today's planned calls, drafts and "Behind plan" accounts.
2. Open a planned call → *Record this call* → *Check in* (allow location) → pick products in the order presented → *Submit*. The check-in shows Verified or Off-site with the distance.
3. Plan tab: progress against the pace marker; open *Cycle 5* to build next cycle's plan from the suggestion, adjust calls per account, *Submit for approval*.
4. Accounts: filter by tier or "In my plan"; open an account without a location and *Pin my location*.

**As a first-line manager**
1. Team view: attainment vs. time elapsed, reach, geo-verified share for each rep.
2. Approve or send back the waiting plan (a note is required to send it back).
3. Team calls → *Check-in issues* to see off-site and missing check-ins.

**As a second-line manager**: compare the two teams, open a team, then a rep.

**As an admin**
1. Import CSV: download the accounts template, add rows, import; errors are shown per line before anything is saved.
2. Export data: calls with check-in coordinates and status, team KPIs, plans.
3. Cycles, products & rules: change the verified radius, require check-in, add a cycle or product.
4. Users & roles: add a rep under an FLM with a temporary password, then sign in as them.

## Feedback to collect
- Is the rep's daily flow fast enough to use between visits?
- Which KPIs do managers expect on the team view that are missing?
- Is the check-in rule (radius, mandatory or not) right for the client's compliance policy?
- Which fields does the client's account master data have that the import template lacks?
