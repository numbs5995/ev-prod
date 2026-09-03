# PRD: EV-Prod — Event Production & Stock Platform (v1 Prototype)

Date: 2026-08-28 · Status: Draft

## Problem Statement

Event prep (Comifuro, Indonesia) currently lives in a Google Sheet. Pain points:

- Cross-page references are painful — data gets **duplicated** between sheets instead of called/linked, so edits drift out of sync.
- The sheet is slow and heavy to navigate.
- At the event itself (bad/no internet), the sheet is impractical for live stock ops (stock opname, gacha counting, prize availability).

## Solution

A lightweight web platform ("EV-Prod", placeholder name) of multiple HTML pages sharing **one data store** (localStorage JSON), styled like an Odoo-style lightweight ERP but scoped to a single merch booth. Works fully offline-first in v1:

- Prep at home: production cost calculator, to-do tracker, merch items tied to vendors.
- Data in one place: merch records carry category, art/production status, stock broken down by source (Pre-order, On-the-spot, Gacha, Auction, Dono goals), so no duplicated fields across "pages".
- Export/import JSON acts as the offline↔online bridge: export from offline file, later upload on the (future) online platform, with automatic backup before any import/merge, and a sync/backup log tab.

Prototype-first: the "prototype vs real product" decision happens after using v1. v1 proves the data model and workflows.

## Data Model (from CF-21 spreadsheet analysis)

Analysis source: `SPREADSHEET CF-21 (1).xlsx`; normalized preview workbook: `analysis/ev-prod-normalized-preview-v2.xlsx`. CF-23 data will use the same structure.

Core rule: **every fact is entered exactly once; everything else is computed.** The original spreadsheet retyped quantities and costs across 4–5 tabs with mismatched names (Akrilik vs Acrylic, Gantungan vs Keychain, "PO" baked into names); EV-Prod replaces this with ID-linked entities.

Entities:

1. **Product** — shared definition of a merch product: canonical name, vendor link, category multi-select, unit production cost + packaging cost (defaults shared by all variants), sell price default, art/production status, notes, artist/PIC. Costs and prices are entered **once per product**, not per variant.
2. **TalentVariant (Item)** — one row per product × talent. Inherits product cost/price/vendor defaults; per-variant overrides allowed (e.g. different artist fee). This removes the 8× retype problem when one product is produced across many talents. Stock, lots, sales, and gacha prizes all link to variants (or to the product for shared items like sticker packs).
3. **CostEntry** — unit production cost + packaging unit cost per product (with optional per-variant override). Typed once, or written by the calculator. The spreadsheet's "Harga Packaging/Unit + Printilan" tab collapses into this.
4. **StockLot** — one production batch per variant: qty by source (gacha, PO, OTS, giveaway), qty produced, status, unit cost snapshot, PIC, batch number. Replaces the retype-everywhere quantity columns of Merch Production + BATCH PRODUCTION + STOCK GACHA tabs. Variant total stock = sum over lots (computed).
5. **SaleRecord** — one row per sold line: variant link, **channel** (PO / OTS / Auction / Staff / Gacha), qty sold, unit price (defaults to product price; Staff channel defaults to unit cost). Profit = computed from CostEntry + SaleRecord, never typed. "Staff" channel = internal buys at production cost or leftover stock.
6. **GachaPool** — gacha prizes referencing variants. Prize qty entered in the pool = adds to the variant's gacha stock source. **Cost/pcs is pulled from the variant's production cost, never retyped** (same price, single source). Play price is flat (25,000 IDR in CF-21). Pool finances use the **cross-subsidy ("subsidi silang") model**: filler prizes carry positive margin and fund top-tier prizes at zero risk — per-prize negative margins are expected and are NOT errors. Solvency is judged **at pool level**: expected cost of goods per pull EV = Σ(drop rate × unit cost); the pool is solvent when play price > EV. The pool view must show EV, play price, and warn when EV ≥ play price (prize allocation too generous). Prize-rate tiers (zonk/mid/gacor) are stored as metadata with their drop rates.
7. **Booking (pre-order)** — one customer order: customer name + contact, item links + qty, price, payment status (pending / paid / fulfilled / shipped / cancelled), **fulfillment type** (pickup at booth / mail order), mail orders add shipping address + manual shipping fee, notes. Source: manual entry or **CSV/XLSX import from the Google Form → Google Sheet export** (bundled offline parser: CSV native, XLSX via bundled SheetJS — works without internet). Item name matching on import uses deterministic fuzzy matching (e.g. "Stndee Acrylic" → "Standee Acrylic"): high-confidence matches auto-map, low-confidence ones ask the user, with an "add as new item" escape hatch. No AI in v1 (offline promise; deterministic matching is free and predictable; AI-assisted column mapping noted as a v3 idea).
8. **Expense** — reserved for v1 (details TBD): date, category (R&D / production / ops), optional product/vendor links, amount, notes. R&D costs are tracked separately, not baked into unit cost. Dashboard shows expense totals.

## Event Container & Print Demand Model

**Event container** (inspired by BoothMate's booth management): the database holds multiple **Events** (e.g. CF-21, CF-23). StockLots, SaleRecords, GachaPools, Bookings, and Expenses belong to an Event. Products/Variants/Vendors are defined per event but can be **cloned into a new event** ("clone product into new event" carries cost/vendor/settings and resets stock) — covering both the user's fresh-merch-every-year reality and the common re-production case. Past events become read-only archives; leftover stock from a stock opname is marked written-off (loss recorded), never re-sold automatically.

**Print demand vs stock** (bookings are demand, not stock):

- Print demand (per variant) = unfilled PO bookings − already fulfilled. Bookings ADD to print demand.
- Stock = Σ StockLots. Physical printing adds stock.
- **Remaining to print** = demand − stock produced (per variant; negative = surplus).
- Multi-batch production is first-class: each StockLot tracks qty ordered vs qty delivered, so the app answers "how many more do I still owe the vendor?" (replaces spreadsheet notes like "kurang 17, ntar di batch").
- Booking lifecycle: pending → paid → fulfilled → shipped. Stock decrements only at **fulfilled** (booking converts from demand into actual stock movement). Fulfilled mail-order bookings consume stock and record the shipping fee.

Derived (never stored): item total stock, per-item profit, pool revenue/cost/margin, event profit summary, print demand, remaining to print.

Pages updated accordingly: add `sales.html` (profit report computed from SaleRecords), `bookings.html` (pre-order list + CSV/XLSX import), and dashboard summary cards for stock/cost/profit/expenses/print demand.

## User Stories

1. As the admin, I want a dashboard home page, so I can see summary (items count, to-dos open, total production cost, stock totals) at a glance.
2. As the admin, I want a merch item record with: name, category (multi-select: PO, Gacha, Dono goals, OTS, Auction, Freebies), art/design status (Art ready, Lagi Komis, Belum Komis), production status (Production test, Sudah produksi), price (manual, from final invoice), production cost, artist name (optional), progress, notes — so all item info lives in one record.
3. As the admin, I want stock per item broken down by source (pre-order, on-the-spot, gacha, auction, dono goals) with total auto-summed, so I never duplicate counts.
4. As the admin, I want a vendor list with name, website/contact link, and notes, so I can find who made what.
5. As the admin, I want to link each merch item to a vendor, so sourcing info is one click away.
6. As the admin, I want a to-do tracker with assignable tasks (assignee field present even if v1 is just me), due-ish ordering, and done state, so prep work is tracked.
7. As the admin, I want a production cost calculator (Dreamer Studio style: tiered qty pricelist, add-on lines, per-line cost + total), so I can estimate before invoicing.
8. As the admin, I want to save a calculator result as a cost onto a merch item, so the calculator and database stay connected.
9. As the admin, I want a gacha section where I add items/quantities into a gacha, so the quantity flows into the linked merch item's gacha stock source (increasing total stock).
10. As the admin, I want price to be manually input from the final invoice, so the DB reflects reality, not estimates.
11. As the admin, I want export (download full JSON) and import (upload JSON) buttons, so data moves between offline file and future online platform.
12. As the admin, I want the system to **always back up current data before an import/merge**, so no import can destroy data.
13. As the admin, I want a Sync/Backup log tab listing every export/import with timestamp, so I can audit what happened.
14. As the admin, I want light & dark theme toggle, so it is readable at a bright booth or at night.
15. As the admin, I want large touch targets and high readability, so I can use it on one device at a noisy event.
16. As the admin, I want the app to work from a plain double-clicked HTML file with no internet, so it runs at the venue.
17. As the admin, I want all pages to read/write the same single data store, so a change on one page is instantly visible on every other page.
18. As the admin, I want empty states that guide me (e.g. "no vendors yet — add one"), so first use is not confusing.
19. As the admin, I want data to survive closing the browser (localStorage persistence), so nothing is lost mid-event.
20. As the admin, I want a future "online mode" button that is present but marked coming-soon, so the mental model is visible from day 1.
21. As the admin, I want a Product entity that carries shared cost/vendor/price defaults, so producing one item across 8 talents needs data entry once, not 8 times.
22. As the admin, I want TalentVariants that inherit product defaults but allow per-variant overrides (artist fee, price), so variants stay low-effort but flexible.
23. As the admin, I want 1-click variant cloning (duplicate a variant inheriting cost/vendor), so adding an 8th talent variant takes seconds.
24. As the admin, I want Event mode with minimum 48px touch targets and a +5 batch button, so rapid tallying during peak hours is fast and error-free.
25. As the admin, I want a channel filter toggle in Event mode (OTS/Gacha/PO/Staff), so tallying matches the sale context without leaving the screen.
26. As the admin, I want an amber badge on variants whose remaining channel stock is ≤ 3 units, so I restock or downsell before running out.
27. As the admin, I want every Event-mode tap to write an atomic SaleRecord automatically, so the ledger stays complete without post-event re-entry.
28. As the admin, I want an audit log of all state mutations (action type, details, ISO timestamp, entity-count snapshot, outcome), so I can trace any change after the fact.
29. As the admin, I want the gacha pool to show aggregate expected cost per pull (Σ drop rate × unit cost) next to the play price, so I know the pool is solvent before the event.
30. As the admin, I want a warning when gacha pool EV ≥ play price, so I catch prize allocation that loses money before printing.
31. As the admin, I want JSON import to default to merge/append with a diff preview, so an outdated file can never silently wipe live sales.
32. As the admin, I want full replace to require a second, typed confirmation, so destructive import is always deliberate.
33. As the admin, I want a "restore last backup" action, so a bad import can be undone in one step.
34. As the admin, I want multiple Events in one database with an event switcher, so I can manage CF-21, CF-23, and future events separately.
35. As the admin, I want to clone a product into a new event (carrying cost/vendor, resetting stock), so next year's fresh merch setup takes minutes.
36. As the admin, I want past events to become read-only archives with written-off leftovers recorded as losses, so history stays clean.
37. As the admin, I want a Bookings page listing all customer pre-orders with payment status and fulfillment type (booth pickup / mail order), so I stop tracking orders in a spreadsheet tab.
38. As the admin, I want mail-order bookings to store address and a manually counted shipping fee, so mail fulfillment is complete in one record.
39. As the admin, I want to import bookings from CSV/XLSX (Google Form export) offline, with fuzzy item-name matching that asks me on low confidence, so form data lands in the database without retyping.
40. As the admin, I want bookings to count as print demand (not stock), so the app tells me how many units I still need to print per variant.
41. As the admin, I want a "remaining to print" view per variant (demand − produced), including multi-batch lots with ordered vs delivered quantities, so I always know what I still owe the vendor.
42. As the admin, I want booking stock to decrement only when a booking is marked fulfilled, so demand and physical stock are never double-counted.

## Screens / Flows

A **single-file app** (`evprod.html`): all pages are client-side views (hash routing / tab panels) in one HTML file with bundled CSS + JS. Rationale: one file to double-click, back up (`evprod.backup-DATE.html`), and share; no cross-page state sync bugs; localStorage store shared trivially. This replaces the earlier multi-page prototype layout — same offline promise, product-shaped architecture. SheetsJS (SheetJS) is bundled for XLSX import; no external network requests at runtime.

Views (hash routes inside the single file):

- `#/dashboard` — Dashboard: summaries (stock, cost, profit, expenses, print demand) + quick links.
- `#/event` — **Event mode (live sales / Fast Booth Tally)**: one screen, large tappable tiles per variant; tap = +1 sale (+5 batch button for bulk), channel fixed to OTS with quick toggle to Gacha/PO/Staff, auto stock decrement, session saved continuously. Touch targets minimum 48px height for primary buttons. Amber badge highlights variants whose remaining channel stock ≤ 3 units. Every tap atomically writes a SaleRecord (auto-ledger). Designed for one-handed phone use at peak booth hours (11:00–15:00); no multi-field form.
- `#/items` — Merch database: products + talent variants, filter by category/status, variant cloning.
- `#/vendors` — Vendor list + detail, linked from products.
- `#/todo` — To-do tracker.
- `#/calculator` — Production cost calculator (Dreamer Studio pattern), attach-to-product.
- `#/gacha` — Gacha pool: prizes, allocations, EV solvency check.
- `#/bookings` — Pre-order bookings: list, manual add, CSV/XLSX import, fulfillment status (pickup / mail).
- `#/sales` — Sales & profit report: SaleRecords grouped by item/channel, computed profit; post-event data entry.
- `#/sync` — Export / import JSON, bookings import, backup-before-import, audit & sync log, restore last backup, event switcher/archive.

## Design Decisions

- Design language: clean, simple, Apple/Google-like — generous whitespace, soft cards, system font stack (Inter fallback), tabular numbers for money/counts.
- **Custom design assets**: the user may provide their own custom designs (theme, layout, visual identity) later. v1 uses a neutral placeholder design system that is easy to re-skin — keep visual tokens centralized in `style.css` (colors, radius, spacing, typography) so a redesign only touches CSS, not page markup. Placeholder design is intentionally conservative; do not over-invest in it.
- Light + dark theme via CSS custom properties; default follows system, toggle persisted.
- Accent color: single calm accent (blue family, like dreamer-calculator `#0a84ff`); status conveyed by colored text chips (green = done/produced, amber = pending/in progress).
- All UI copy in English. Status values translated to English equivalents: Art ready / Commission in progress / Not commissioned, and Production test / In production. (Original Indonesian terms — Lagi Komis, Belum Komis, Sudah produksi — are kept here for reference only; the UI uses English.)
- Mobile-friendly (single admin device at event; may be a phone).

## Implementation Decisions

- Single source of truth: one JSON object in `localStorage` (namespaced, e.g. `evprod.db.v1`), containing events, products, variants, vendors, bookings, todos, gachaEntries, expenses, syncLog. Active event selected via switcher; all queries scoped to it.
- Competitive positioning: BoothMate (booth-day POS) validates event-mode and catalog UX but is sell-side only; EV-Prod differentiates on the full lifecycle (production cost, print demand, gacha EV, bookings import, audit). Dynamic QRIS and per-member settlement explicitly not v1 goals.
- **Audit/mutation log**: every state change appends an entry to the sync log with fields: Action type (CREATE_ITEM, UPDATE_ITEM, LIVE_TALLY_SALE, SYNC_GACHA_TO_MASTER, EXPORT_DATABASE, IMPORT_DATABASE, RESTORE_BACKUP, …), details snippet, ISO timestamp, entity-count snapshot, outcome status (ok/failed). Shown in the sync view; exportable with the database.
- `assets/data.js` provides load/save/migrate + export/import helpers; every page imports it.
- Import flow: read JSON → auto-download backup of current data → **diff preview** (row counts by entity, source file timestamp vs current DB, list of what will change) → default mode is **merge/append** (SalesRecords, StockLots, expenses appended; nothing silently dropped) → full **replace** requires a second explicit confirmation with typed keyword → import result written to sync log. A "restore last backup" action reads the most recent auto-backup from the sync log. Rationale: at-venue imports must never be able to silently wipe hours of live sales.
- Backups: timestamped JSON downloads (`evprod-backup-YYYY-MM-DD-HHmm.json`); before major edits, manual copies `name.backup-DATE.html` (existing user habit from yh-sparks).
- Gacha entry: pick item, enter qty, confirm → increments that item's `stock.gacha` and total; entry recorded in gachaEntries for audit.
- Cost calculator: standalone first; "attach to item" writes both computed Base Unit Cost and Packaging Cost directly into the selected Product record (per-variant override available).
- No login in v1 (single admin device). Future: username/password per user for merge/add attribution tracking — noted in data model (records carry optional `createdBy` field, unused in v1).
- Scale target: 100–200 rows comfortably per event; no pagination needed in v1.
- Bookings: in v1 (user already tracks pre-orders manually in a spreadsheet tab). Fulfillment types: booth pickup / mail order (address + manual shipping fee). Stock decrements only on fulfilled.
- Import name matching: deterministic fuzzy matching only (no AI) in v1 — offline, free, predictable. AI-assisted matching noted as v3 idea.

## Out of Scope (v1)

- Online platform / server / real sync (v2 — the "online" button is a stub).
- Login & multi-user tracking (v2).
- Multi-device offline merge (single offline device only).
- Gacha pull mechanics (pull buttons, per-prize decrement) — not wanted.
- Google Sheets API integration (bookings arrive via CSV/XLSX file export instead).
- Dynamic QRIS, payment processing, per-member settlement (BoothMate covers these; not EV-Prod's job).
- AI-based import matching or content detection (deterministic fuzzy matching in v1; AI noted for v3).
- Reporting beyond dashboard + sales view (custom report builder = later).

## Open Questions

(none — all settled in interview rounds 1–3)

## Appendix — Source Analysis

- Original workbook: `SPREADSHEET CF-21 (1).xlsx` (15 tabs, ~38 MB). Focus tabs analyzed: Merch Production, DATA HASIL PENJUALAN, STOCK GACHA CF-21, Harga PackagingUnit + Printilan, BATCH PRODUCTION.
- Key problems found: same quantity/cost typed in 3–4 tabs; item names inconsistent across tabs (Akrilik/Acrylic, Gantungan/Keychain, channel baked into names); costs recomputed per tab; no audit trail.
- Normalized preview workbook (built from real CF-21 data): `analysis/ev-prod-normalized-preview-v2.xlsx` — sheets: Summary, Items (41), StockLots (40), SaleRecords (48), Gacha (11 prizes + rates).
- CF-23 spreadsheet pending; will map to the same entities when shared.
- Competitor: **BoothMate** (boothmate.id, Play Store com.rayo.boothmate) — artist-alley POS: catalog with photos/variants/ownership, booths, offline visual-grid selling, QRIS (static/dynamic), change calc, discounts, per-member settlement, restock hints, checklist, CSV import. Borrowed: event/booth container, visual tally grid, low-stock indicator. Deliberately not copied: payment/QRIS/settlement (out of scope); its sell-side-only focus misses EV-Prod's production-cost/print-demand core problem.

## Status

PRD v1.1 — all interview rounds settled, competitor analysis folded in, CF-21 data model verified against real data. Ready for build session.

---

## Design Addendum — 2026-09-04

_All decisions below were settled through a structured design discussion session. These changes extend v1 and are targeted for the next implementation cycle._

---

### 1. Items Page — Redesign: Talent-Centric View

**Change:** The Items page (`items.html`) is redesigned from a **product-centric** layout (product cards → variant rows) to a **talent-centric** layout (talent cards → variant rows per talent).

- Product cost, vendor, and price remain on the Product entity; they are still visible per variant row for calculation and display purposes.
- An **Edit Product** button is accessible per variant row, opening the existing product modal.
- Shared / group items (variants with `talentId = null`, e.g. Sticker Pack) are grouped in a dedicated **"Shared / Group Items"** section at the bottom of the page.
- Search and category filter chips remain functional.

---

### 2. Stock Breakdown Per Channel

**Change:** Each variant's stock is now displayed broken down by **lot source / channel** rather than as a single aggregate number.

Channel columns in the variant table: `OTS | PO | Gacha | Auction | Freebie | Dono Goal | Giveaway | Custom | Total`

Stock reduction rules per channel:

| Channel | Stock Added | Stock Reduced By |
|---------|------------|-----------------|
| OTS | Lots with source = OTS | OTS + Staff sales |
| PO | Lots with source = PO | Booking fulfillment → PO SaleRecord |
| Gacha | Lots with source = Gacha + stock transfers in | Gacha sales |
| Auction | Lots with source = Auction | Auction sales |
| Freebie | Lots with source = Freebie | Write-off at event archive |
| Dono Goal | Lots with source = Dono Goal | Write-off at event archive |
| Giveaway | Lots with source = Giveaway | Write-off at event archive |
| Custom | Lots with source = Custom | Write-off at event archive |

Freebie, Giveaway, and Dono Goal are **product category labels and lot sources only** — individual give-out events are not tracked per unit. Remaining Freebie/Giveaway/Dono Goal stock appears on the dashboard as an amber reminder to distribute before the event ends.

**Custom Purpose stock** counts toward the total stock figure and is marked as "reserved." A free-text `purposeNotes` field is required when source = Custom.

---

### 3. Expanded Lot Source Values

**Change:** `StockLot.source` is expanded from `['PO', 'OTS', 'Gacha', 'Giveaway']` to:

```
'PO' | 'OTS' | 'Gacha' | 'Giveaway' | 'Auction' | 'Freebie' | 'Dono Goal' | 'Custom'
```

New field added: `lot.purposeNotes` (string, only required when `source = 'Custom'`).

---

### 4. Stock Transfer Between Channels (Audit Trail)

**Change:** Users can transfer stock between channels (e.g. reclassify 5 units from OTS to Gacha) without losing history.

Mechanism: a **Transfer action** on a lot that:
1. Reduces the source lot's qty by the transfer amount (creates a negative adjustment lot, or updates lot qty with a linked record).
2. Creates a new lot with the target source and transferred qty.
3. Logs a `TRANSFER_STOCK` action in the audit log with full detail (from, to, qty, reason).

This preserves full traceability — the original OTS lot history is not destroyed.

---

### 5. Deadstock Handling

**Change:** The original PRD stated leftover stock is "marked written-off (loss recorded), never re-sold automatically." This is preserved, with the following additions:

- At event archive, a **Stock Opname** step is presented where the user confirms actual remaining qty per variant.
- Remaining units are flagged as `lot.isDeadstock = true` and logged as `DEADSTOCK_WRITEOFF` (loss recorded).
- Deadstock records **remain visible** in the event history for reference during next-cycle planning (e.g., "last event had 8 leftover Nana standees").
- A **"Carry over → new lot"** action on deadstock records lets the user manually create a new lot in a target event, pre-filled with the deadstock qty. The user sets the new source (e.g., Gacha, Freebie). No automatic transfer.
- `lot.deadstockCarriedTo` records the target `eventId` when a carry-over is performed.

---

### 6. Vendor Order Workflow — 4-Stage Status

**Change:** `StockLot.status` is expanded from `['ordered', 'delivered']` to a 4-stage workflow:

```
To Do → Ordered → On Delivery → Arrived
```

Stage meanings:
- **To Do** — order plan; user knows more stock is needed but has not yet contacted the vendor.
- **Ordered** — order confirmed by vendor.
- **On Delivery** — vendor has shipped.
- **Arrived** — items received at warehouse. At this stage, `qtyDelivered` is entered manually (default = `qtyOrdered`; user adjusts for defective/missing units). Optional `defectNotes` field appears when `qtyDelivered < qtyOrdered`.

Migration: existing `lot.status = 'ordered'` maps to `'todo'`; `'delivered'` maps to `'arrived'`.

---

### 7. Split-Vendor Production Support

**Change:** A single product can be split across two different vendors for different production batches (confirmed real-world case).

- `StockLot.vendorId` is added as a **required field** on every lot.
- At lot creation, `vendorId` defaults to `product.vendorId` but is fully editable.
- When `lot.vendorId` is null (legacy lots), the system falls back to `product.vendorId`.
- The Vendor detail modal queries lots using effective vendor: `lot.vendorId ?? product.vendorId`.

---

### 8. Vendor Detail Modal

**Change:** Clicking a vendor now opens a **detail modal** showing all lots/orders placed with that vendor for the active event.

The modal shows: item name, lot source, qty ordered, qty delivered, current status. Each row has **Advance Status** and **Edit** actions.

A **"+ New Order"** button in the vendor modal creates a new lot pre-filled with the vendor, starting at `To Do` status.

Users can also create lots from the variant row ("+Lot" button), which inherits the product's vendor by default. Both entry points produce the same lot record.

---

### 9. Bundle Entity (New)

**Overview:** Bundles are pre-defined sets of variants sold together at a special price. Bundles are available in **Bookings only** (not Event Mode, for v2).

**New entity: `DB.bundles[]`**

```
id, eventId, name,
discountMode: 'free_items' | 'discount',
discountType: 'fixed' | 'percent',   // only when discountMode = 'discount'
discountValue: Number,
items: [ { variantId, qty, isFree } ],
notes, created
```

**Pricing rules (mutually exclusive — one mode only):**
- `free_items` mode: one or more items marked `isFree = true`; bundle price = sum of non-free item catalog prices only.
- `discount` mode: global discount (fixed Rp or percentage) applied to the sum of **all** items' catalog prices.
- Cannot mix free items and a discount in the same bundle.

**Stock:** Bundles do not have their own stock. Effective bundle stock = `min(chanStock(variantId, 'PO'))` across all components. Stock is shared — the same variant can appear in multiple bundles simultaneously.

**In Bookings:** When adding a booking item, the user can choose a variant or a bundle. A bundle booking item is stored as a single line (`bundleId` reference, qty, final bundle price). The variant breakdown is not shown in the booking list.

**At Fulfillment (`fulfilBooking`):** A bundle booking item expands into one `SaleRecord` per component:
- Free items: `SaleRecord.price = 0`; stock still consumed.
- Discount mode: each component's price = proportional share of the final bundle price based on catalog price ratios. All component SaleRecords carry `bundleId` for grouping.

**In Sales Report (Option 3):** SaleRecords tagged with a `bundleId` render as a collapsible group:
- **Summary row:** bundle name, total qty, bundle revenue, bundle net profit.
- **Component rows (expandable):** each variant, its prorated price, and its individual profit contribution (free items show as Rp 0 / profit = −cost).

**Cross-talent bundles** (mixing variants from different talents, or including shared items) are fully supported.

---

### 10. Data Model Field Summary (New / Changed)

| Entity | Field | Change |
|--------|-------|--------|
| `StockLot` | `vendorId` | NEW — required; defaults to product.vendorId |
| `StockLot` | `source` | EXPANDED — add Auction, Freebie, Dono Goal, Custom |
| `StockLot` | `purposeNotes` | NEW — free text; required when source = Custom |
| `StockLot` | `status` | EXPANDED — 'todo' \| 'ordered' \| 'on-delivery' \| 'arrived' |
| `StockLot` | `defectNotes` | NEW — optional; filled at Arrived if qtyDelivered < qtyOrdered |
| `StockLot` | `isDeadstock` | NEW — boolean; set at event archive |
| `StockLot` | `deadstockCarriedTo` | NEW — eventId if manually carried over |
| `SaleRecord` | `bundleId` | NEW — null for standalone; set when from bundle fulfillment |
| `Booking.items[]` | `bundleId` | NEW — null for standalone items |
| `Bundle` | entire entity | NEW — see § 9 above |

---

### 11. Out of Scope (v2)

The following were discussed and explicitly deferred:

- Bundle recognition in CSV/XLSX booking import (fuzzy match on bundle name) — v3.
- Per-unit give-out tracking for Freebie / Giveaway / Dono Goal — PRD original stance preserved (write-off at archive).
- Bundle tiles in Event Mode — booking-only for v2.
- End-user confirmation of proportional price allocation for bundle discounts — documented for future communication; proportional allocation is the v2 default.

---

### 12. Local Persistence — Python Backend (`db.json`)

**Change:** Storage architecture is migrated from browser-only `localStorage` to a local Python backend (`server.py`) writing directly to a `db.json` file on disk.

**Problem Addressed:** `localStorage` is vulnerable to browser cache clearance, incognito isolation, and browser switching. Storing the database in a local `db.json` file guarantees reliable persistence, file portability, easy backups, and consistent access across any browser on the machine.

**Architecture & Behavior:**
- **Backend:** Lightweight Python 3 Flask server (`server.py`) serving endpoints `GET /db` and `PUT /db` (atomic writes via temporary files to avoid write corruption).
- **Single Source of Truth:** Data is strictly loaded from and saved to `db.json`. There is **no dual-write or silent fallback to `localStorage` for data**, preventing silent data drift or split state.
- **Client Save Pattern:** The client keeps mutations responsive with an in-memory DB and a debounced (50ms) asynchronous save queue (`PUT /db`).
- **Server Offline Handling:** If the client cannot connect to the Python backend on initial load, a full-screen blocking error is displayed with instructions to start the server via `start.bat` (Windows) or `./start.sh` (Mac/Linux).
- **Scoped `localStorage` Use:** `localStorage` is exclusively retained for non-critical UI preferences (`LS_THEME` for dark/light mode and `LS_CHAN` for active tally channel selection), never for entity data.