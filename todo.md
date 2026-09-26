# BidRender TODO

Entries below v5.75 say "BidPhase" — that was the name at the time, and they are
left as written rather than rewritten to match the rename.

## SaaS Multi-User Upgrade (v4.0)

- [x] Upgrade project to full-stack (database + auth + backend server)
- [x] Design and implement 10-table database schema for multi-user isolation
- [x] Add passwordHash and emailVerified fields to users table
- [x] Build email/password signup procedure (bcrypt, session cookie)
- [x] Build email/password login procedure (timing-safe comparison)
- [x] Build logout procedure
- [x] Build change-password procedure
- [x] Wire all feature routers (auth, projects, data) into main appRouter
- [x] Build server-side db.ts helpers for all 10 tables
- [x] Build AuthGuard component (shows LoginPage when unauthenticated)
- [x] Build LoginPage with email/password form, signup/login toggle, show/hide password
- [x] Build DataConnectorsPanel with 3 tabs: Materials DB, Labor Standards, API Connectors
- [x] Materials DB tab: CSV/JSON upload, column normalization, bulk import, clear all, preview table
- [x] Labor Standards tab: JSON-based profile editor, create/edit/delete profiles, default flag
- [x] API Connectors tab: Platt/Rexel/WESCO/generic REST, API key storage, connection test
- [x] Add AccountSection to SettingsTab (signed-in user display + sign out button)
- [x] Copyright audit: update electricalDatabase.ts header to clarify original authorship
- [x] Remove all NECA Column 1 inline comments, replace with "original estimate"
- [x] Write vitest tests for email/password auth (signup, login, logout) — 7 tests pass
- [x] Dual-mode Assembly/Item estimate engine (from previous session)
- [x] 28 pre-built electrical assemblies seeded into electricalDatabase.ts

## Pending / Future

- [ ] **Before the priced catalog ships: give "nobody has priced this" its own
      signal.** `shared/materialPricing.ts` and the Materials screen's unpriced
      filter both decide it from `costPerUnit === 0`. That works only while
      every shipped row is zero. The moment the pricing sheet lands in
      `server/seed/materials/*` (CLAUDE.md § "Where a priced catalog lands"),
      a zero stops meaning unpriced and the screen will report a fully-priced
      catalog that no contractor has checked a line of — which is the exact
      failure the $0 rule was written to prevent, arriving from the other side.
      Needs a way to say "this is our example price, not yours": a column, or
      comparing against the seed value. **Blocks the upload, not the sheet.**

- [ ] **No lug covers 400–500 kcmil.** The range lugs stop at 250-350 kcmil
      (added 2026-09-25 for the pricing sheet's 350 kcmil lugs), while the
      catalog ships 400 and 500 kcmil THHN and XHHW AL. The per-size 500 kcmil
      lug was retired with the move to ranges and nothing replaced it. The
      next range is an owner's call — which span a supply house sells, e.g.
      350-500 kcmil — so it is not guessed here.

- [ ] Replace fractional resize recentering with true page-box centering in the PDF viewer
- [ ] Ensure the PDF canvas stays fully within the left pane as the divider moves
- [ ] Connect estimate engine to user's custom materials DB (fall back to built-in DB)
- [ ] Connect estimate engine to user's active labor standard profile
- [ ] Save estimate sessions to DB (currently frontend-only)
- [ ] Project management UI (create/rename/archive projects from the sidebar)
- [ ] Stripe subscription billing (free trial → paid tier)
- [ ] Email verification flow
- [ ] Password reset via email
- [ ] Admin dashboard for user management

## Bug Fixes & UI Polish (v4.1)

- [x] Login page: clean up clunky layout, fix overlapping lines, polish visual design
- [x] Login page: remove lightning bolt icon, show only "BidPhase" text
- [x] Login page: enforce strong password requirements (min 8 chars, uppercase, number, special char) with visual indicator
- [x] Default project state: remove pre-seeded jobs, show "New Project" placeholder when no projects exist
- [x] Projects: always allow deleting down to zero (no minimum project count enforced)
- [x] Sidebar navigation: allow toggling between Residential/Commercial/Industrial/Infrastructure from inside a workspace
- [x] Scale enforcement: require scale to be set before any measuring is allowed
- [x] Scale display: fix false "Scale set" message showing before scale is actually configured
- [x] Measure/Run sync: synchronize the measure and run controls at the top of the page
- [x] Unit count dropdown (right panel): fix so it works independently — should not require clicking the top toolbar button

## PDF Workspace Improvements (v4.2)

- [x] Scale: prompt to set scale on first entry if not previously set (modal/overlay)
- [x] Scale: reset clears the input field so user types a fresh value (no stale previous value)
- [x] Scale: draggable scale points — click a placed dot to reposition it before confirming
- [x] Scale: "Reset Scale" button always visible in toolbar
- [x] Runs: click any line segment to activate that run (no need to use top toolbar)
- [x] Runs: draggable run points — click any placed dot to drag and reposition it
- [x] Delete-all: confirm dialog when deleting 3+ items; also clears count pins for active session
- [x] Pin shapes: add 2 larger square sizes, 1 larger circle, 2 smaller dot sizes
- [x] Pin shapes: add 3 triangle sizes (small, medium, large)
- [x] Wire types: replace conduit size picker with 50-entry wire type list (Romex, SER, SEU, THHN, low-voltage, etc.)
- [x] Wire types: stranded/solid selector on applicable wire types
- [x] Default conduit/conductor: start with 1/2" EMT + #12 copper (not 3/4" EMT)
- [x] Labor/material tab: entire tab row is tappable (not just the text label)
- [x] Empty state copy: update "No runs yet" message to mention materials broadly
- [x] Right panel: auto-expand when a run is pushed so the new run is visible

## v4.3 — Crosshair, Pin Shapes, App Audit

- [x] Remove floating crosshair from run/measure mode (revert to default cursor behavior)
- [x] Add XL size to all 4 pin shape families (dot, square, circle, triangle)
- [x] Standardize pin shape names and sizes across CountIcons.ts and canvas draw code
- [x] App audit: verify all toolbar buttons interact correctly with each other
- [x] App audit: verify all delete/trash tools work as expected
- [x] App audit: document any issues or suggestions found

## v4.5 — Color-Matched Dots & Professional Calc Terminology

- [x] Color-matched run dots: endpoint dots use the active run's color instead of red
- [x] Color-matched cursor: crosshair is yellow when measuring, run-color when dropping run points
- [x] Jacketed/Romex module: add Measured Takeoff, Makeup Allowance, Service Loop, Waste Factor, Terminations, Runs inputs
- [x] Jacketed/Romex module: implement Net Length and Total Billable Wire calculation
- [x] Conduit module: add Measured Takeoff, Conduit Waste Factor, Wire Makeup Allowance, Wire Waste Factor, Terminations inputs
- [x] Conduit module: implement Total Billable Conduit, Net Wire Length per conductor, Total Billable Wire calculation
- [x] Update AppContext RunItem data model with all new professional estimating fields
- [x] Remove old wireSlackPct/conduitSlackPct (replaced by Waste Factor terminology)

## v4.6 — Crosshair Overlay, Scale Prompt, Electrical Category

- [x] Restore full-screen spanning crosshair lines overlay (vertical + horizontal lines to canvas edges) while keeping current + cursor shape
- [x] Add per-page scale verification prompt: show modal/overlay whenever user navigates to a page without a scale set, before they can measure or add runs
- [x] Combine Residential/Commercial/Industrial/Infrastructure into single "Electrical" category on homepage cards
- [x] Combine 4 category icons into single "Electrical" icon in left sidebar

## v4.7 — UI Polish + Run Workflow Improvements

- [x] Remove lightning bolt icon from CategoryLanding homepage (keep text-only Electrical card)
- [x] Hide Estimate Engine tab from left sidebar (treat like hidden categories, keep backend)
- [x] Replace electrical sidebar bolt icon with a minimalist electrical panel / breaker box icon
- [x] Show current page scale (e.g. "1 in = 20 ft") in PlanPanel toolbar at a glance
- [x] Right-click context menu on canvas: "Continue run from here" option to resume/extend the active run from any clicked point; easy dismiss (click elsewhere or press Escape)
- [x] Auto-pause active run measurement when user switches to Unit Count tab; auto-resume when switching back to Runs tab (unless they explicitly selected a different run)

## v4.8 — UX Polish Round 2

- [x] Double-right-click (not single) to open "Continue run from here" context menu
- [x] Fix delete run confirmation: only mention the run being deleted, not "all items"
- [x] Scale badge: show both ref footage (e.g. "50 ft ref") and computed ratio (e.g. "1 in ≈ 20 ft")
- [x] Remove scale prompt on page open; only show it when user clicks Measure or Add Run
- [x] Unit Count: simplify shape labels to just shape name (no size suffix)
- [x] Unit Count: remove "Start Counting" step — pressing a shape immediately starts counting
- [x] Unit Count: add collapsible dropdown per shape (expand/collapse on click)
- [x] Fix material search bar (hidden/not working in Unit Count section)
- [x] Make Unit Count tab itself collapsible (click tab to collapse/expand the whole panel)

## v4.9 — Backend Cleanup

- [x] Remove unused DB tables: count_sessions, estimate_sessions, material_rows, plan_images, user_api_connectors, user_assemblies, user_labor_standards
- [x] Remove dead router procedures: laborStandards, apiConnectors from dataRouter
- [x] Remove dead DB helper functions for all removed tables from server/db.ts
- [x] Clean up DataConnectorsPanel: remove LaborStandardsTab and ApiConnectorsTab, keep only MaterialsTab
- [x] Fix projectsRouter: remove old 4-category enum, hardcode "electrical" category
- [x] Push DB migration (0002_chunky_adam_warlock.sql) — 7 tables dropped
- [x] Schema now has 3 tables: users, projects, user_materials_db

## v5.0 — UI Polish Round 3

- [x] Remove Unit Count button from top toolbar (redundant with right panel)
- [x] Fix Set Scale toggle: yellow = scale mode active/editable, dark = locked; clicking again saves previous scale (no toggle off)
- [x] Scale pin shape numbers with shape size (larger shapes get larger font numbers)
- [x] Harmonize run colors and pin colors to vibe with app dark palette while staying distinguishable
- [x] Rename "Electrical" sidebar entry to "Projects" with a new clean icon matching early-phase icon style
- [x] Homepage improvement suggestions delivered to user

## v5.1 — Homepage Merge, Run Workflow, Cursor & UX Polish

- [x] Merge homepage with project list: branded BidPhase header + project cards below on same screen
- [x] BP logo/icon in sidebar always navigates back to home/project list
- [x] Set Scale button changes to "Reset Scale" after scale is set; clicking Reset Scale asks for confirmation before clearing
- [x] Cursor: dot with crosshair lines (not plus shape) — color-matched to active run or yellow in scale mode
- [x] Condensed pin color picker: small swatch popup grid instead of expanded inline picker
- [x] Run cards in right panel: collapsible (click to expand/collapse like Unit Count)
- [x] Run cards: replace minimize button with X button; X asks before deleting
- [x] Deleting a run from right panel also removes it from toolbar strip; remaining runs re-number sequentially
- [x] Run workflow: Pause button (saves progress, exits measure mode), Resume button (re-enters measure mode for that run), Finish button (completes/locks the run)
- [x] Clicking a run in the toolbar strip or right panel re-enters measure mode for that run (resume)

## v5.2 — Homepage/Projects Merge + Scoped Delete/Clear/Reset

- [x] Merge homepage and projects page: project list cards appear directly on the home screen (no separate Projects page)
- [x] Remove the Projects tab from the left sidebar
- [x] Remove the yellow "New Project" button from the top-right (redundant with Create your first project / inline add)
- [x] Add a small "New Project" action inline on the home screen (e.g. a card or row at the bottom of the project list)
- [x] Scope toolbar trash button: only deletes the active run (in Runs mode) or clears pins for the active count session on the current page (in Unit Count mode) — not everything
- [x] Add page-scoped "Clear page runs" button: removes all runs on the current page with a confirmation dialog
- [x] Add page-scoped "Clear page counts" button: removes all count pins on the current page with a confirmation dialog
- [x] Add "Total Reset" button: clears all runs and count pins across all pages; requires confirmation dialog; provides undo (restore previous state)

## v5.3 — Card/Panel Polish

- [x] Project cards: remove folder icon, make project name text larger, make cards taller/bigger
- [x] Right panel: collapsible with intuitive expand/collapse toggle (chevron or drag handle)
- [x] Right panel header: remove "Infrastructure" category label, replace yellow icon with BP logo
- [x] Material/labor summary: replace the weird symbol with the BP logo

## v5.5 — Right Panel & Unit Count Redesign

- [x] Move "Clear page counts" button from right panel to top toolbar (next to existing clear controls)
- [x] Unit Count tab: accordion pin shape selector — all shapes shown side-by-side as small icons; clicking one expands it inline to show size variants; clicking another collapses the previous
- [x] Unit Count tab: condense color picker to a small swatch row (no labels, no expanded grid)
- [x] Right panel: collapsible/minimizable with an easy expand button
- [x] v5.4 cursor fixes: smooth overlay cursor (no lag), count mode dot cursor, count cursor color matches session, Reset Scale returns to dark inactive state

## v5.6 — Unit Count UX & Panel Polish

- [x] Allow unit counting before scale is set (remove scale gate from count mode)
- [x] Remove "Save to Labor & Materials" button from Unit Count tab (redundant)
- [x] Redesign shape + color selector: single compact inline row, less space
- [x] Right panel: fully collapsible to a thin strip (like left sidebar), easy expand button
- [x] Toolbar Runs button: switches right panel to Runs tab, collapses Unit Count tab
- [x] Toolbar Unit Count button: switches right panel to Unit Count tab, starts counting immediately

## v5.7 — Trash/Clear/Panel/PDF UX

- [x] Trash button: delete active pins (count mode) OR active run points (measure mode) — whichever is active
- [x] Clear All: clears both pins AND runs on the current page (not separate buttons)
- [x] Remove the weird square/swatch preview to the right of the color swatches in Unit Count
- [x] Runs list: always visible (remove the collapsible dropdown, show runs directly)
- [x] Right panel: collapse to a very thin strip like the left sidebar, expand back with a button
- [x] PDF upload: ask user to confirm before loading a new PDF; warn that all pins/runs/scale will be cleared

## v5.8 — Right Panel Accordion Fix

- [x] Material search bar: restore visibility under Unit Count section
- [x] Right panel sections: mutually exclusive accordions (Runs / Unit Count / Materials) — clicking one collapses the others
- [x] Right panel collapse/expand: fix so the panel actually collapses to a thin strip and expands back reliably

## v5.9 — Panel & Cursor Polish

- [x] Right panel thin strip: add a visible expand button/chevron so user can click anywhere on the strip to restore the panel
- [x] Right panel header: add a reset-size button to snap the panel back to default 40% width after user drags the divider
- [x] Runs accordion: make it collapsible — clicking the header when Runs is already open should collapse it (not just stay open)
- [x] Cursor: always yellow (#F5C518) in both count mode and measure mode — no run-color matching for the dot or crosshair lines

## v5.10 — Right Panel Layout Reorder

- [x] Right panel: move Unit Count accordion to the top (above Runs)
- [x] Right panel: move Runs accordion below Unit Count
- [x] Right panel: rename "Materials" section to "Material Summary" and make it always-visible (non-collapsible), showing live totals

## v5.11 — Material Summary Reposition & PDF Tool Bug

- [x] Material Summary: remove the "Material Summary" heading, move the section inline below Runs in the scrollable area (grows with content, not pinned to bottom)
- [x] Fix: toolbar/tools disappear after loading a new PDF into an existing project

## v5.13 — Panel Expand Arrow & Toolbar Wrap

- [x] Fix: expand arrow (ChevronLeft) not visible on the collapsed right panel thin strip
- [x] Toolbar: when panel is narrow or collapsed, toolbar buttons/shapes wrap to next line so all tools remain accessible

## v5.14 — Run Continuity & Panel Toggle

- [x] Delete run: auto-create a replacement run (same number/color) so measuring can continue immediately without interruption
- [x] Right panel: replace separate collapse/expand arrows with a single toggle button that works in both states

## v5.16 — Clear Page & Single Toggle

- [x] Fix: "Clear Page" does not remove all pins and runs on the current page
- [x] Fix: two collapse/expand buttons still visible in the right panel (strip + header)

## v5.17 — Header Arrows, Page Label, PDF Tool Fix

- [x] Right panel header: add a left-pointing arrow (expand) next to the right-pointing arrow (collapse) so both directions are always available in the header
- [x] Right panel header: change "Pg N" badge to "Page N" (spell out "Page")
- [x] Fix: tools and cursor do not appear after replacing a PDF in the viewer (z-index / overlay not cleared properly)

## v5.18 — Panel Controls & Pin Size Fix

- [x] Remove Total Reset button from under the material summary section in the right panel
- [x] Add reset-to-default-size button in the right panel header (next to the toggle arrow) to snap panel back to 40% width
- [x] Dot shape: when panel collapses, the dot should drop into the shape list (not stay in header)
- [x] Pin shapes: scale with zoom — shrink as user zooms out so they don't clutter the drawing

## v5.19 — Measurement & UX Polish

- [x] Double-left-click on canvas in measure mode: drop a disconnected start point (lifts the pen) so user can start a new segment on the same run without connecting to the last endpoint
- [x] Remove Pause and Finish buttons from the measuring toolbar
- [x] Unit count sessions: remove the pencil rename button; make the session name label itself inline-editable on click

## v5.20 — UX Simplification & Feature Polish

- [x] Right-click pen-lift: right-click in measure mode lifts the pen (disconnects next segment); remove old right-click context menu
- [x] Run name inline edit: click run name in right panel to rename it directly (same as session rename)
- [x] Keyboard shortcut hints: small key labels on toolbar buttons (M=Measure, C=Count, Esc=exit, U=undo)
- [x] Empty state canvas: when no PDF loaded, show a clear upload prompt in the canvas area
- [x] Scale indicator: always show current scale ratio as a persistent badge in the toolbar
- [x] Contextual toolbar: show only relevant tools per mode (Measure mode / Count mode / Neutral)
- [x] Run list as compact table: Name | Length | Type columns, easier to scan (compact table with inline rename)
- [x] Material Summary highlight: briefly animate the row that changed when a run/pin is added (num-flash on totals)
- [x] Page thumbnails strip: horizontal strip of page thumbnails below hint bar for multi-page PDFs
- [x] Export button: CSV export of all runs + count sessions in right panel header (Download icon)

## v5.21 — Toolbar & PDF UX Fixes

- [x] Remove PDF thumbnail strip (too messy)
- [x] Clarify page number chips in toolbar (add "Pg" prefix so numbers are clearly page numbers)
- [x] Remove "Stop Measurement" and "Stop Count" buttons from the two top toolbar tools
- [x] Restore Upload PDF button in measure and count mode toolbars (always accessible); keep confirmation dialog
- [x] Fix undo glitch: PEN_LIFT sentinel now removed atomically with its paired point
- [x] Fix Clear Page cursor glitch: reset dragRef, isPanning, mousePos, crosshair on all Clear Page confirms

## v5.22 — Critical Cursor & Tool Fixes

- [x] Fix: cursor disappears after clicking Confirm in Clear Page dialog (stopPropagation on all overlay dialogs)
- [x] Fix: cursor disappears after clicking Confirm in PDF Replace dialog; tools stop working after new PDF loads (root cause: Document component not remounting + useEffect race condition resetting pageReady after onRenderSuccess. Fixed with key={pdfHash} on Document, removed pdfFile from useEffect deps, added cursor reset in onPageRenderSuccess)
- [x] Replace right-click pen-lift with simultaneous left+right click pen-lift (both-button detection in handleCanvasMouseDown)

## v5.23 — Navigation & UI Cleanup

- [x] Remove intermediate page between homepage and PDF tool (go directly from project list to PDF viewer)
- [x] Rework homepage to show projects directly with professional/clean design
- [x] Revert page numbers from "Pg N" back to plain numbers (cleaner)
- [x] Remove all residential/commercial/industrial/civil & underground verbiage (including trash view)
- [x] Ensure Measure and Count buttons always visible in top toolbar (easy to switch between modes)

## v5.25 — Measurement UX Improvements

- [x] Show per-segment subtotals in run panel for multi-segment runs (e.g. "45' + 32'" breakdown below total)
- [x] Lower zoom threshold for segment distance labels (MIN_SEG_SCREEN_PX: 40 -> 25)
- [x] Smooth pinch-to-zoom: incremental approach, simultaneous zoom+pan, isTouchingRef guard prevents mouse/touch conflict

## v5.26 — Pinch & Segment Label Fixes

- [x] Fix pinch jitter: bypass React state during gesture — apply CSS transform directly to DOM, sync React state only on touchend
- [x] Per-segment canvas labels: each segment group shows its total footage over its midpoint; individual line distances show when zoomed in
- [x] Run total only in toolbar: removed per-segment breakdown from right panel; right panel shows total footage only

## v5.28 — Pinch & Panel Touch Fixes

- [x] Fix pinch-to-zoom jitter: removed React state from pagesContainerRef transform in JSX; useLayoutEffect now exclusively drives the transform from refs on every render, so React's reconciler can never overwrite the gesture transform with stale state
- [x] Suppress left panel from opening during touch/pinch gestures: added touchAction:none + userSelect:none to viewport, preventDefault on 2-finger touchstart, and context menu suppression during touch
- [x] Added single-finger touch pan support (idle mode only) so users can pan on mobile without needing two fingers

## v5.29 — Pan Jitter, Sidebar & Label Fixes

- [x] Fix mouse pan jitter: stop calling setPanOffset during mousemove drag; write directly to DOM via ref, sync React state only on mouseup
- [x] Fix left sidebar activating during pan: body.bp-dragging class added on mousedown, CSS pointer-events:none on aside during drag; global mouseup listener cleans up if mouse released outside viewport
- [x] Fix measurement run total label occlusion: refactored drawRun into drawRunGeometry (lines+dots) + drawRunLabels (labels only); main draw loop now does all geometry first then all labels on top

## v5.30 — Material Database Overhaul

- [x] Schema: add category, userPrice, defaultPrice, lastUpdated columns to userMaterialsDb; push migration
- [x] Backend: add updatePrice, resetPrice, addSingle procedures to dataRouter; update bulkImport to handle new columns
- [x] CSV column mapping UI: after file select, show mapping screen before import
- [x] Replace-database confirmation dialog with stern warning
- [x] Inline-editable materials table with userPrice cell (saves immediately on blur/enter)
- [x] Age indicator: color-code lastUpdated text (green <30d, yellow 30-90d, red >90d)
- [x] Reset-to-default button (undo icon) with confirmation prompt
- [x] Red-flag empty price cells (both userPrice and defaultPrice null/0)
- [x] Add Custom Material button + quick-entry form
- [x] Wire MaterialDatabasePage into BidPhaseShell sidebar nav
- [x] Update estimating engine fallback: userPrice > defaultPrice, flag if both missing; CatalogPicker now shows user DB items with effective price

## v5.31 — Master Electrical Catalog & Run Cost Integration

- [x] Generate 623-item master electrical catalog (Distribution, Conduit, Wire, Rough-in, Devices, Civil) in materialCatalog.ts
- [x] Replace static materialCatalog.ts with new comprehensive catalog; added getConduitPricePerFoot() and getWirePricePerFoot() lookup helpers
- [x] Build DB seeder: hasMaterials + seedFromCatalog procedures; MaterialDatabasePage shows seed banner when DB is empty
- [x] Wire/conduit variable chart already visible; conduit type/size + wire type/AWG pickers confirmed working
- [x] Waste factor: simplified conduit runs to single shared slider (default 10%) for both conduit and wire
- [x] Auto cost-per-foot: conduit and wire size selection auto-looks up price from catalog via getConduitPricePerFoot/getWirePricePerFoot
- [x] Run totals show emerald-green material cost breakdown (conduit cost + wire cost + total) with cost/ft × billable ft formula displayed

## v5.32 — Catalog Expansion to 1,021 Items

- [x] Expanded master electrical catalog from 623 to 1,021 items
- [x] Added: Lighting (48 items: LED wafers, vapor tights, exit/emergency, outdoor, commercial), Low Voltage & Data (26 items: structured wiring, patch panels), Civil & Misc expanded (69 items: ground rods, grounding, marking tape, site materials), additional Distribution (252 total), Conduit Fittings (219 total), Wire & Cable (127 total)
- [x] Fixed all Unicode inch symbol and escaped-quote issues in description strings
- [x] TypeScript: 0 errors, dev server: clean

## v5.35 — Smart Fuzzy Search with Trade Slang

- [x] Build shared smartSearch utility: fuzzy matching + trade alias/synonym map covering boxes, conduit, wire, breakers, devices, fittings, and civil slang
- [x] Wire smartSearch into CatalogPicker (Unit Count) replacing current filter
- [x] Wire smartSearch into MaterialDatabasePage replacing current filter

## v5.36 — Trade Slang Aliases, Unit Count Material Picker, Custom Price, Run Tool

- [x] Add searchAliases field to CatalogItem interface; populate key items with trade slang (romex, jbox, 4 square, flex, greenfield, wiremold, etc.)
- [x] Update smartSearch to also score against searchAliases field
- [x] Unit Count: when "New Count Session" is clicked (or Count # is created), show a catalog picker inline so user can search and select a material to populate the session name and unit price — replaces the count line instead of creating a new one
- [x] Unit Count: each session row gets an inline custom price-per-item field (editable number input, saves immediately)
- [x] Runs panel: restore full run tool card — conduit type/size picker, wire type/AWG picker, waste factor slider (default 10%), material cost display — replacing the compact table view

## v5.37 — User DB Prices in Run Tool

- [x] Update getConduitPricePerFoot / getWirePricePerFoot to accept optional userMaterials array and apply userPrice > catalog default priority
- [x] Fetch user materials in UnifiedProjects via tRPC and pass them down to RunCard price lookups
- [x] Verify run tool cost display reflects user-overridden prices from Material Database

## v5.38 — Run Tool Overhaul

- [x] Add wireWasteFactor field to RunItem (default 10%); conduitWasteFactor already exists
- [x] Add conduitOnly boolean to RunItem (default false) — conduit-only run, no wire
- [x] Rename "Jacketed / Romex" run type to "Wire Only" (bare conductors, no conduit)
- [x] Conduit run mode: pull points, wire termination makeup, wire waste factor slider, conduit waste factor slider — all inputs allow 0
- [x] Wire-only run mode: service loop, makeup per termination, number of terminations, wire waste factor slider — all inputs allow 0
- [x] Conduit-only toggle inside conduit mode: hides wire section, excludes wire cost from totals
- [x] Conduit type list: derived from user DB (EMT/RMC/IMC/PVC/FMC/LFMC keywords), ordered most-to-least common, falls back to catalog
- [x] Wire type list: derived from user DB (THHN/NM-B/MC/SER/URD/XHHW keywords), falls back to wireTypes catalog
- [x] Live pricing: cost-per-foot re-reads from user DB on every render (already wired — verify)
- [x] TypeScript: 0 errors after all changes

## v5.39 — Run Tool Fixes

- [x] Rename "Conduit" run type button to "Conduit & Wire"
- [x] Wire Only mode: remove conductor size (AWG) picker — size is embedded in wire type selection
- [x] Run type: ensure selecting one type clears the other (no dual runType + conduitOnly conflict)
- [x] Add MC Cable sizes to materialCatalog: 14/2, 14/3, 12/2, 12/3, 10/2, 10/3 (per foot + per 250ft roll)
- [x] Add MC fittings to materialCatalog: MC connectors (straight, 90°), MC staples, MC straps
- [x] Add "MC Cable" as a dedicated category tab in WireTypePicker with all MC sizes
- [x] Fix conduit trade sizes per type: EMT (1/2–4"), RMC (1/2–6"), IMC (1/2–4"), PVC (1/2–6"), FMC (3/8–2"), LFMC (3/8–2"), ENT (1/2–2"), LFNC (3/8–1"), GRC (1/2–4") — only show sizes valid for each type
- [x] Diagnose and fix pricing calculation bug: MC/NM catalog lookup now uses full wireTypeId (e.g. mc-12-2 → wir-mc-12-2) instead of size-only fallback

## v5.40 — Price Sync + Run Type Rename + LFNC Expansion

- [x] Rename run type button from "Conduit & Wire" to "Conduit / Wire"
- [x] Add LFNC sizes 3/8", 1/2", 3/4", 1", 1-1/4", 1-1/2", 2" to materialCatalog.ts (per foot)
- [x] Add LFNC fittings: straight connectors, 90° connectors, couplings (all sizes) to materialCatalog.ts
- [x] Update conduit sizes map: LFNC now goes up to 2" (was 1")
- [x] Build tRPC mutation: upsertMaterialPrice(description, userPrice) — upserts userPrice on matching DB row by description keyword match
- [x] Build reusable PriceSyncDialog component: shown when user saves a price that differs from DB; "Yes, update DB" calls upsertMaterialPrice; "No, keep local" dismisses
- [x] Wire PriceSyncDialog into Unit Count custom price-per-item field: on blur, compare entered price to DB row for that session's material; if different, show dialog
- [x] TypeScript: 0 errors after all changes

## v5.41 — Catalog Sync, Grounding Conductor, Live Pricing, Measurement Fix

- [x] Verify all new catalog items (LFNC sizes/fittings, MC fittings) are in the master CATALOG array so seedFromCatalog pushes them everywhere
- [x] Add grounding conductor toggle to RunCard (off by default); when on, show size picker (14, 12, 10, 8, 6, 4, 2, 1/0 AWG); include grounding wire footage in billable wire total and cost
- [x] Rename "Conductors" label to "Current Carrying Conductors" in RunCard
- [x] Fix conduit/wire price lookup: selecting any conduit type/size or wire type/size must immediately recompute cost using the correct catalog ID key from user DB
- [x] Remove "Estimated Material Cost" section from right panel (replaced by live cost in Labor & Material section)
- [x] Wire live material cost display into the Labor & Material section so it updates as user toggles conduit/wire selections
- [x] Fix conductor count calculation bug: calcWire returns per-conductor footage but was not being multiplied by conductors in Wire Only cost display, totalWire aggregation, and wire map breakdown
- [x] Fix double-count bug in conduit mode: calcConduitWire already multiplies by conductors internally; removed redundant \* r.conductors in CrossPageTotals cost aggregation
- [x] Audit measurement tool: math chain confirmed correct (round-trip cancels); scale display formula verified (162 px/in = 72 points × scale 2.25)
- [x] TypeScript: 0 errors after all changes

## v5.42 — EGC Reposition + Calc Bug Fixes

- [x] Fix wire footage bug: 235 ft × 3 conductors × 0% waste should equal exactly 705 ft — changed wireTermMakeup/numPullPoints defaults from 2 to 0 in RunCard and CrossPageTotals
- [x] Fix conduit pricing bug: conduit cost is coming in way too high — findUserPrice now prefers per-foot rows and normalizes per-stick entries by dividing by stick length
- [x] Move EGC (grounding conductor) toggle to a prominent position in RunCard — now appears after conductor size section, before Estimating Inputs
- [x] Make EGC conductor material toggleable (Cu / Al) — added groundMaterial field to RunItem interface; Cu/Al toggle shown when EGC is enabled
- [x] EGC footage must be included in the total wire footage display and cost aggregation — added to totalWire in CrossPageTotals and cost uses groundMaterial
- [x] TypeScript: 0 errors after all changes

## v5.45 — Major Feature Expansion (6 Systems)

### 1. Database Schema Expansion

- [x] Add customerName, address, bidDate, notes, status (enum: Bidding/Won/In Progress/Lost) to projects table
- [x] Create master_items table (userId, itemCode, category, description, unit, masterMaterialCost, masterLaborHours, isActive)
- [x] Create master_assemblies table (userId, name, description, phase, isActive)
- [x] Create master_assembly_items join table (assemblyId, masterItemId, qty, sortOrder)
- [x] Create master_labor_rates table (userId, name, ratePerHour, type: journeyman/apprentice/foreman)
- [x] Create project_items table (projectId, masterItemId, description, unit, qty, masterMaterialCost, overrideMaterialCost, masterLaborHours, overrideLaborHours, phase, sortOrder)
- [x] Create project_assemblies table (projectId, masterAssemblyId, name, phase, sortOrder)
- [x] Create project_assembly_items table (projectAssemblyId, masterItemId, description, unit, qty, masterMaterialCost, overrideMaterialCost, masterLaborHours, overrideLaborHours)
- [x] Create bid_summary table (projectId, percentageLaborFactor, lumpSumHours, markupPct) — one row per project
- [x] Push all schema migrations with pnpm db:push

### 2. tRPC Procedures

- [x] projects router: add search query, update mutation (customerName, address, bidDate, notes, status)
- [x] masterItems router: list, create, update, delete, bulkImport
- [x] masterAssemblies router: list, get (with items), create, update, delete, addItem, removeItem, reorderItems
- [x] masterLaborRates router: list, create, update, delete
- [x] projectItems router: list (by projectId), add (from master or manual), update (qty/overrides), delete, resetToMaster
- [x] projectAssemblies router: list, add (from master), update, delete, updateItem (override), resetItemToMaster
- [x] bidSummary router: get, upsert (percentageLaborFactor, lumpSumHours, markupPct)

### 3. Homepage

- [x] Replace current homepage with clean project grid (Project Name, Customer, Bid Date, Status badge)
- [x] Large search bar at top — wildcard filter across projectName, customerName, address simultaneously
- [x] Status color badges (Bidding=yellow, Won=green, In Progress=blue, Lost=gray)
- [x] "New Project" button with modal (name, customer, address, bid date, status)
- [x] Click project → navigate to Project Detail view

### 4. Project Detail View

- [x] Editable header: Customer Name, Address, Bid Date (date picker), Status (dropdown), Notes (textarea)
- [x] Auto-save on blur for all header fields
- [x] "Back to Projects" button (large, obvious)
- [x] Estimating workspace below header (tabs: Assemblies, Standalone Items, Bid Summary, BOM/RFQ)

### 5. Master Items & Assemblies Management UI

- [x] Settings/Master Catalog page: list master items with search, add/edit/delete
- [x] Master Assemblies page: list assemblies, click to expand items, add/remove items, set qty
- [x] Master Labor Rates page: list rates, add/edit/delete

### 6. Project Assembly Workspace

- [x] "Add Assembly" button — opens master assembly picker, adds copy to project
- [x] Assembly card: shows name, phase, item list with qty/override price/override labor hours
- [x] Inline edit for qty, overrideMaterialCost, overrideLaborHours per item
- [x] "Reset to Default" button per item (replaces override with master value)
- [x] "Add Standalone Item" button — opens master item picker or manual entry
- [x] Phase grouping: items/assemblies can be tagged to a phase

### 7. Bid Summary

- [x] Show rawTotalHours (sum of all overrideLaborHours × qty across all items/assemblies)
- [x] percentageLaborFactor input (default 1.0) — multiplier on rawTotalHours
- [x] lumpSumHours input (default 0) — flat add/subtract
- [x] finalAdjustedHours = (rawTotalHours × percentageLaborFactor) + lumpSumHours
- [x] totalMaterialCost = sum of (overrideMaterialCost × qty) across all items
- [x] markupPct input — applied to material cost only
- [x] Grand total display: material + markup + (finalAdjustedHours × laborRate)

### 8. BOM & RFQ Generation

- [x] Aggregate all project items + assembly items by itemCode/description, sum quantities
- [x] Internal BOM view: description, SKU, aggregated qty, unit, overrideMaterialCost, extended cost
- [x] RFQ view: description, SKU, aggregated qty, unit — NO pricing or labor
- [x] Export BOM as CSV
- [x] Export RFQ as CSV (price-stripped)

### 9. Tests & Cleanup

- [x] Vitest: test bid summary math (rawHours × factor + lumpSum = finalHours)
- [x] Vitest: test BOM aggregation (same item across 2 assemblies sums correctly)
- [x] Vitest: test override/reset (override changes value, reset restores master)
- [x] TypeScript: 0 errors after all changes

## v5.46 — Dedicated Homepage + Classic Projects Card Layout (COMPLETE)

- [x] Create a new BidPhase Homepage (route: /home) — BP branding, tagline, "Go to Projects" CTA button
- [x] BP logo in sidebar navigates to /home (not directly to projects)
- [x] Add a /projects route that shows the classic card-grid layout
- [x] Projects page: dashed "+" card at end of grid to create a new project
- [x] New project creation: name-only inline input (no modal, no extra fields required)
- [x] Existing project cards: project name large, created date small, Open / Rename / Delete action row
- [x] Sidebar nav: add "Projects" nav item pointing to /projects
- [x] TypeScript: 0 errors after all changes

## v5.49 — Project Meta Fields + EGC in L&M Panel + Clear Page Reorder

- [x] Add customerName, address, bidDate, status optional fields to CivilProject interface in AppContext
- [x] Add updateProjectMeta function to AppContext to update those fields per project
- [x] Update ProjectsPage cards to show status badge, customer, address, bid date and allow inline editing via expand/collapse
- [x] Add EGC running total section to CrossPageTotals right panel (after Conductors, before Per-Page Breakdown) — shows billable footage per EGC size/material
- [x] Move Clear Page button to immediately after Unit Count button in idle toolbar (before Undo)
- [x] TypeScript: 0 errors

## v5.50 — RBAC + Assembly Builder + Admin Feature Flags

### Step 1: RBAC

- [ ] Add "contractor" to the role enum in schema.ts (alongside "user" and "admin")
- [ ] Push DB migration for role enum change
- [ ] Expose ctx.user.role to frontend via auth.me query
- [ ] Add useIsAdmin() and useIsContractor() hooks to frontend

### Step 2: Assemblies DB (already exists — verify and document)

- [ ] Confirm master_assemblies, master_assembly_items tables are live
- [ ] Confirm masterAssembliesRouter procedures are wired and functional
- [ ] Confirm laborHours field exists on assembly items

### Step 3: Assembly Builder UI

- [ ] Create standalone AssemblyBuilderPage accessible from sidebar
- [ ] List all master assemblies with search/filter
- [ ] Create/edit assembly: name, description, phase, add items from materials DB with qty
- [ ] Show labor hours total per assembly (sum of item qty × masterLaborHours)
- [ ] Wire to masterAssembliesRouter (list, create, update, addItem, removeItem)

### Step 4: Feature Flags System

- [ ] Add feature_flags table: id, flagKey (unique), label, description, enabledForContractors, updatedAt
- [ ] Push DB migration for feature_flags table
- [ ] Add featureFlagsRouter: getAll (admin), upsert (admin), getForUser (public — returns only keys + enabled state, no admin data)
- [ ] Add featureFlagsRouter to appRouter
- [ ] Add useFeatureFlag(key) hook to frontend that reads from getForUser query

### Step 5: Admin Settings Page

- [ ] Create AdminSettingsPage accessible ONLY when role === "admin"
- [ ] Add "Admin" nav item to sidebar (only visible to admins)
- [ ] Feature Flags section: list all flags with toggle switches, label, description
- [ ] Seed the "enable_labor_units" flag (default: OFF for contractors)
- [ ] Gate all labor-related UI in ProjectAssembliesTab, BidSummaryTab, BomRfqTab behind useFeatureFlag("enable_labor_units")
- [ ] Gate labor data in tRPC responses: strip laborHours fields from projectAssemblies/projectItems list when flag is OFF for contractor role
- [ ] TypeScript: 0 errors after all changes

## v5.50 — RBAC + Assembly Builder + Feature Flags (COMPLETE)

### Step 1: RBAC

- [x] Add `contractor` to the role enum in drizzle/schema.ts (alongside existing `user` and `admin`)
- [x] `adminProcedure` already existed in server/\_core/trpc.ts — no change needed
- [x] Owner openId is auto-promoted to `admin` on every login upsert in db.ts — no change needed
- [x] All existing pages remain accessible to contractor/user role by default

### Step 2: Assemblies Database

- [x] `master_assemblies` and `master_assembly_items` tables already existed from v5.45 — no new migration needed
- [x] `feature_flags` table added to schema (flagKey, label, description, enabledForContractors, timestamps)
- [x] DB migration pushed (pnpm db:push)
- [x] `getAllFeatureFlags`, `getFeatureFlag`, `upsertFeatureFlag`, `seedDefaultFeatureFlags` helpers added to db.ts
- [x] `seedDefaultFeatureFlags` called at server startup — seeds `enable_labor_units` flag (default OFF)

### Step 3: Assembly Builder UI

- [x] `AssemblyBuilderPage` created at client/src/pages/AssemblyBuilderPage.tsx
- [x] Create/rename/delete assemblies with name and optional phase
- [x] Expand assembly to see item list; add items from master catalog via search
- [x] Inline qty editing per item with auto-save on blur
- [x] Material cost and labor hours totals per assembly (labor columns hidden when flag is OFF)
- [x] `useFeatureFlag` and `useFeatureFlags` hooks created at client/src/hooks/useFeatureFlag.ts
- [x] Assembly Builder wired into BidPhaseShell routing at /assemblies with Package icon in sidebar

### Step 4: Admin Dashboard — Feature Flags UI

- [x] `featureFlagsRouter` created with `getAll` (admin only), `upsert` (admin only), `getForUser` (authenticated)
- [x] `AdminSettingsPage` created at client/src/pages/AdminSettingsPage.tsx
- [x] Toggle switches for each flag with ON/OFF badge and description
- [x] Role reference table showing admin/contractor/user distinctions
- [x] Admin Settings nav item in sidebar — only visible when `user.role === "admin"` (Shield icon)
- [x] Route `/admin` wired into BidPhaseShell

### Step 5: Labor Units Feature Toggle

- [x] `enable_labor_units` flag seeded as first toggle (default OFF for contractors)
- [x] `useFeatureFlag("enable_labor_units")` used in AssemblyBuilderPage to hide/show labor columns
- [x] `featureFlags.getForUser` returns all flags as `Record<string, boolean>` — admins always get true
- [x] System is scalable: add new flags via `seedDefaultFeatureFlags` or Admin Settings UI, consume with `useFeatureFlag(key)`

### Tests

- [x] All 38 existing vitest tests pass (0 regressions)
- [x] TypeScript: 0 errors

## v5.51 — Sidebar/Icon Swap, Unit Count Tools, Runs Mode, Plastic Boxes, Search Sync

- [x] Swap sidebar order: Assembly Builder below Material Database
- [x] Swap icons: Assembly Builder gets Database icon, Material Database gets Package icon
- [x] Add Clear Page button to Unit Count toolbar (same behavior as Runs clear page)
- [x] Add Delete button to Unit Count toolbar (delete active count session pins)
- [x] Clicking Runs tab in right panel re-enters measure mode for the active run
- [x] Add residential plastic boxes to materialCatalog.ts with trade slang aliases (1-gang, 2-gang, 3-gang, 4-gang, old work, new work, round, octagon, 4-square, weatherproof, PVC, handy box, gem box, etc.)
- [x] Sync all material search bars (Unit Count, right panel, Material DB) with user DB + master catalog
- [x] Unit Count app catalog syncs with Material Database (user DB rows appear in count search)
- [x] Master catalog count in Material Database page updates dynamically when admin adds/removes items
- [x] TypeScript: 0 errors

## v5.52 — Unified Search Aliases + Unit Count Toolbar Styling

- [x] Expanded ALIAS_MAP in smartSearch.ts with comprehensive trade slang: plug/outlet/receptacle/device, GFI/GFCI/ground fault, AFCI/arc fault, USB, spec grade, tamper resistant, weatherproof, 3-way/4-way/dimmer/fan switch, can/pot/wafer/downlight/troffer/strip/vapor tight, smoke/CO/combo detector, doorbell/chime/transformer, thermostat/stat, panel/loadcenter/breaker/CB, meter socket/base/can, disconnect/safety switch, conduit fittings, wire/cable types, boxes, strut/channel, and more
- [x] Removed all duplicate ALIAS_MAP keys (52 duplicates removed)
- [x] Unit Count toolbar Delete button now uses icon-only ghost style matching Runs toolbar Trash button
- [x] Unit Count toolbar Clear Page button now uses text+icon ghost style with hover:text-destructive matching Runs toolbar Clear page button exactly
- [x] Clear Page only shows when there is content on the page (same conditional as Runs toolbar)
- [x] TypeScript: 0 errors

## v5.53 — Assembly Add-Item Fix, Assembly Unit Counter, Multi-Circuit Runs

- [x] Fix Assembly Builder: catalog items with null category/itemCode now pass zod validation (z.string().nullable().optional())
- [x] Unit Count: count sessions can be linked to a master assembly — each pin represents one assembly instance
- [x] Unit Count: assembly search picker in active session config; shows assembly name badge when linked; X to unlink
- [x] Unit Count: "ASM" badge on session row when an assembly is linked; price-per-item field hidden for assembly sessions
- [x] Unit Count: Save to L&M expands assembly sessions into individual line items (item.qty × pin count per item)
- [x] Run Calculator (conduit mode): multi-circuit conductor groups — Add Circuit / Remove Circuit buttons
- [x] Run Calculator: each circuit has its own conductor count slider, Cu/Al material toggle, and AWG size grid
- [x] Run Calculator: wire cost and CrossPageTotals aggregate across all conductor groups per run
- [x] TypeScript: 0 errors

## v5.55 — Assembly Search Fix + Unit Counter Save-to-L&M Button

- [x] Assembly builder search: deduplicate DB results by description (keep oldest row, hide duplicates from repeated imports)
- [x] Assembly builder: server-side upsert — importing a catalog item that already exists returns the existing DB row instead of creating a new duplicate
- [x] Assembly builder: search panel closes immediately on item click (optimistic close, no stale results)
- [x] Assembly builder: all result buttons disabled immediately on click (prevents duplicate adds from multi-tap)
- [x] Unit counter: Save to L&M button added to each session row (visible when session has ≥1 pin)
- [x] smartSearch: added outlet cover / outlet plate / switch cover / switch plate / cover / screwless aliases
- [x] TypeScript: 0 errors

## v5.56 — Run Totals Fix, Section Reorder, Search Fix, Export Button, Assembly Badge

- [x] Fix run totals not updating on drag/extend: useEffect now depends on full point coordinates; drag-end auto-re-pushes footage if run was already pushed
- [x] Reorder RunCard: Run Type first → Current Carrying Conductors → EGC → Conduit details (Wire Only hides irrelevant fields immediately)
- [x] Remove duplicate Run Type toggle left at old position
- [x] Fix assembly builder search stale results: allItems fetched whenever assembly is expanded (staleTime:0) and force-refetched when add panel opens
- [x] Restore large full-width Export Material List (CSV) button with solid yellow background
- [x] Assembly count badge: solid yellow pill with Layers icon + assembly name (up to 12 chars)
- [x] TypeScript: 0 errors

## v5.57 — RunCard Reorder, Circuit Labels, Empty/Future Hide, Cover Plates

- [x] Reorder conduit RunCard: Conduit Type → Conduit Size → Empty/Future Pull toggle → Conductors → EGC → Estimating Inputs → Outputs → Fittings
- [x] Empty/Future Pull toggle now highlighted yellow when active (border + text)
- [x] Conductor groups and EGC hidden when Empty/Future Pull is on (no wire needed for stub-outs)
- [x] Circuit label changed from "Circuit 2" to "Circuit 2 of 3" so user knows total circuit count
- [x] Added 33 new white device cover plate items to master catalog: 1G/2G/3G/4G standard, midsize (Leviton 80601-W/80714-W), jumbo (Leviton 88001-W/88014-W), screwless (Leviton 84001-W/84003-W/84014-W), combination plates; all with searchAliases
- [x] Added smartSearch aliases: no screw, smooth plate, seamless plate, midsize plate, jumbo plate, oversized plate, double/triple/quad gang plate, 2/3/4 gang plate, combination plate, combo plate
- [x] TypeScript: 0 errors

## v5.58 — RunCard Reorder, Cover Plates Simplified, Search Engine v2

- [x] Move conduit type/size/empty selector to directly after Run Type toggle (before conductors)
- [x] Simplify cover plates: remove screwless/jumbo/midsize specialty items; replace with 20 standard mid-size (Midway) white cover plates (1G/2G/3G/4G × Blank/Duplex/Toggle/Decora/GFCI)
- [x] Rewrite smartSearch v2: per-token alias expansion, prefix-aware tiered scoring (exact→starts-with→word-boundary→contains), all-tokens-must-match filter, item index cache
- [x] Rich alias map: 150+ trade terms, abbreviations, brand names (Romex/NM-B, THHN/THWN, EMT/thin wall, GFCI/GFI, decora/rocker, outlet/receptacle, conduit bodies, panels, breakers, etc.)
- [x] TypeScript: 0 errors

## v5.59 — Assembly Picker UX, EGC Wire Totals, Locked Takeoff, Export Button

- [x] Unit counter: replace assembly text search with searchable dropdown (shows all assemblies, filters as you type, auto-fills session name from assembly name)
- [x] Unit counter: auto-fill session name from assembly name when assembly is linked
- [x] Run calculator: lock Measured Takeoff field — read-only when feetFromPlan=true; shows lock icon and hint; only plan tool can update
- [x] Run calculator: include EGC in billable wire length — conduitWireBillable now adds EGC footage; output shows breakdown (incl. X ft EGC)
- [x] Restore yellow Export button with dropdown: Export as CSV (Excel-compatible) and Export as PDF (print dialog) options
- [x] TypeScript: 0 errors

## v5.61 — PDF Performance Sprint

- [x] Bitmap cache: renderPageBitmap() renders pages via raw pdfjs-dist OffscreenCanvas and stores ImageBitmap per page, keyed by pdfHash+page
- [x] Prefetch ±2 adjacent pages in background after each page render (staggered 50ms apart to avoid blocking main thread)
- [x] pdfDocRef stores raw pdfjs document on PDF load for bitmap rendering
- [x] Crosshair-only redraw: snapshot canvas after full redraw; on mouse move only restore snapshot + draw crosshair lines (no full run/pin redraw on every mouse move)
- [x] Snapshot invalidation: re-captured whenever runs, pins, or page change so crosshair always restores to correct state
- [x] TypeScript: 0 errors

## v5.70 — Smooth Crosshair Rebuild (Dedicated Canvas Approach)

- [x] Rolled back to stable baseline before all RAF/snapshot jitter experiments
- [x] Crosshair moved to dedicated crosshairCanvas (zIndex 11, pointer-events:none) — main canvas never redrawn on mouse move
- [x] crosshairPosRef + RAF deduplicate crosshair draws; no React state change on mouse move = zero jitter
- [x] Viewport cursor: grab off-page at all times, grabbing when panning; canvas cursor:none in active tool mode
- [x] Page navigation (goToPage) now calls zoomReset() so clicking any page chip or arrow re-centers at 40% zoom
- [x] TypeScript: 0 errors

## v5.71 — Estimating Defaults to 0, Zoom Glitch Fix, Instant Page Load

- [x] Crosshair canvas size synced inside drawCanvas — prevents stale canvas dimensions after zoom causing crosshair to draw at wrong scale
- [x] bitmapCanvasRef added: displays cached bitmap instantly on page navigation (z-index 1, behind overlay canvas); eliminates blank-page flash when switching pages
- [x] onRenderSuccess caches current page to bitmapCanvas and prefetches adjacent pages
- [x] Instant bitmap display useEffect: draws cached bitmap to bitmapCanvas immediately when currentPage changes
- [x] All estimating input defaults changed to 0: conduitWasteFactor, wireWasteFactor, wirewasteFactor, makeupAllowance, serviceLoop, numTerminations, wireTermMakeup, numPullPoints
- [x] calcWire, calcConduitBillable, calcConduitWire function default parameters all changed to 0
- [x] All ?? 10 fallback defaults in run calculations changed to ?? 0
- [x] handlePush new run defaults changed to 0 for all estimating fields
- [x] TypeScript: 0 errors

## v5.72 — PlanPanel Consistency Fixes

- [x] Page centering on navigation works for all projects (old and new) — re-center again after cached/real page render so page changes always land with the full sheet visible
- [x] Bitmap cache and instant page load works for all projects — legacy saved PDFs now auto-derive and persist pdfHash on restore so old projects use the same bitmap cache + prefetch path
- [x] Restore scrollable page overview panel — wheel zoom is disabled while the overview overlay is open so the page picker can scroll naturally again
- [x] TypeScript: 0 errors

## v5.73 — Project Switching & Fast Page Load

- [x] useLocalStorage re-reads from localStorage when key changes (project switch) — fixes stale page/zoom/hash
- [x] PlanPanel tabKey-change effect resets all transient state (numPages, autoFittedRef, bitmapPageRef, mode, pan, zoom) on project switch
- [x] Document key includes tabKey so switching projects always forces a fresh react-pdf mount
- [x] Start zoom always 40% centered when opening any project
- [x] Page navigation works correctly across all projects
- [x] Instant bitmap cache loading works across all projects
- [x] TypeScript: 0 errors

## v5.74 — Smooth All Projects + Remove M Logo

- [ ] Fix lag/jitter on page load and navigation for all projects (match Pine St smoothness)
- [ ] Remove M logo/icon from measurement distance display on runs

## v5.74 — Smooth All Projects + M Logo Fix

- [x] Remove "M=measure" text from hint bar (was appearing as M logo next to run distance)
- [x] Skip pdfLoading gate when bitmap cache already has the current page — instant display on project switch
- [x] Replace heavy react-pdf thumbnail rendering in page overview with lightweight bitmap cache canvases
- [x] TypeScript: 0 errors

## v5.75 — Rename to HelixBid

- [x] Renamed all occurrences of "BidPhase" / "Bid Phase" to "HelixBid" across all source files, comments, UI text, exports, page titles, IndexedDB name, and package.json
- [x] Renamed BidPhaseShell.tsx → HelixBidShell.tsx and BidPhaseHomePage.tsx → HelixBidHomePage.tsx
- [x] All imports and references updated automatically
- [x] TypeScript: 0 errors

## v5.92 — Direct Anthropic API Configuration

- [x] Add an encrypted server-side `ANTHROPIC_API_KEY` secret for direct Anthropic requests
- [x] Configure BidRender's server-only direct Anthropic client without exposing credentials to the browser or GitHub
- [x] Add automated validation for the direct Anthropic configuration
- **REVERTED 2026-08-12.** A stopgap while the Forge gateway key was thought to
  be missing; the gateway works, so the second credential path was removed
  (`server/directAnthropic.ts`, `server/anthropic.secret.test.ts`). The app
  reaches Claude one way only, through `BUILT_IN_FORGE_API_KEY` — see
  `references/deploying.md` § 8. If direct Anthropic access is ever wanted
  deliberately, that doc needs updating too.

## v5.92 — GitHub Synchronization Verification

- [x] Review the newer GitHub schema changes and identify the exact migrations required by the synchronized code
- [x] Apply only verified, non-destructive schema migrations needed for the merged BidRender release
- [x] Verify the restarted application loads without server or client build errors

## v5.93 — Publish Verification & Internal Project Rename

- [x] Verify the saved checkpoint and GitHub `main` are aligned before publishing
- [x] Rename the internal Manus project identity from BidPhase to HelixBid
- [x] Validate the renamed project configuration and document the safe Publish behavior
- **Branding test reverted 2026-08-12.** `server/projectBranding.test.ts`
  asserted `VITE_APP_TITLE === "HelixBid"`, a variable this repo never sets, so
  it failed everywhere except the environment that defines it. The rename
  itself stands; only the test was removed.

## v5.94 — Archive Cleanup Activation

- [x] Inspect and apply the verified database migration 0026 required by the current BidRender GitHub main branch
- [x] Register the documented 30-day archive-cleanup heartbeat for the deployed application
- [x] Validate the migration and active scheduled job, then save a checkpoint synchronized with GitHub main

## v5.95 — Pre-Deploy Migration Synchronization

- [x] Pull the latest GitHub main branch and inspect migrations 0029, 0030, and 0031
- [x] Apply the verified pending schema migrations with `pnpm db:push` before release
- [x] Correct the discovered missing `pricing_defaults.productivityPct` column required by the merged release
- [x] Validate the migrated release, synchronize GitHub main, and save the publish-ready checkpoint

## v5.96 — R2 Backup Release & Verification

- [x] Pull the latest GitHub main and inspect the independent R2 backup tool plus all pending migrations
- [x] Re-run the GitHub release inspection cleanly from the newest main branch before any merge or migration action
- [x] Apply verified schema migrations and validate the backup-enabled release (checkpoint pending)
- [x] Add the four encrypted, server-only Cloudflare R2 credentials after production deployment
- [x] Add the required encrypted `R2_BUCKET` name and validate the R2 destination before running the backup
- [ ] Resolve the Manus source-storage 403 responses blocking the four stored PDF copies, then rerun and verify a complete production backup

## v5.97 — Source Storage Repair & Complete R2 Backup

- [x] Classify the four 403 storage keys as development fixtures rather than customer data
- [x] Resolve the 403 blocker by removing the four user-approved stale test references whose source objects no longer exist
- [x] Rerun and verify a complete R2 backup containing the database, manifest, and every remaining stored-file reference

## v5.98 — Approved Stale Test Data Cleanup

- [x] Remove only the four approved stale test bid/PDF records: Trace test, Copilot test, Stamp test, and Sheet test
- [x] Confirm the four `test/...` PDF references are gone before rerunning the backup

## v6.0 — Multi-Trade Foundation, Clients & Dashboard Entry

- [x] Add the `trade` axis to labor rates, kits and the company settings tables (migrations 0034/0035)
- [x] Keep labor rates and settings shared across trades with the `all` sentinel rather than stamping them electrical
- [x] Add client records (company/individual, address, phone, email, notes, archivable) linked to bids by a nullable `clientId`
- [x] Diagnose plan upload failing entirely — storage refusing the browser before any bytes leave (bucket CORS)
- [x] Replace the one vague upload error with six that say what happened and whether retrying helps
- [x] Raise the plan limit to 500MB and add the same-origin fallback for while CORS is unconfigured
- [x] Add a retry button to a failed upload, reusing the file already chosen
- [x] Build the Clients screen and the client control on a bid
- [x] Put "Upload a plan" and "Quick bid" on the Dashboard as the two ways to start
- [x] Remove the legacy splash page; `/`, `/home` and unknown routes land on the Dashboard
- [x] Delete six dead legacy page files and retire the `/trash` and `/project/:id` routes
- [ ] Apply the storage bucket CORS rule (references/deploying.md § 9) — plan upload above 25MB stays broken until it lands
- [x] Add ranged PDF loading so a 500MB set does not have to be fully resident in tab memory
- [ ] Verify plan tracing and scale-setting against a plan that actually uploaded

## v5.99 — Exact GitHub Main Deployment Sync

- [x] Synchronize the local project exactly with the latest GitHub `main` branch without local feature edits
- [x] Apply only the pending migrations provided by GitHub `main` using `pnpm db:push`
- [x] Validate the GitHub-aligned build and save the exact publish-ready checkpoint

## v6.09 — Bid 420001 Plan Storage 403

- [x] Inspect production logs and the bid 420001 database plan record for the failed plan request
- [x] Probe the recorded plan key through the configured server-side storage read path
- [x] Document the storage access-denied finding and the non-destructive recovery path

## Follow-ups from v5.129 — Docs & Changelog

- [ ] `references/deploying.md` § 8 says login is "OAuth-only; no password flow is wired up despite `passwordHash` existing on `users`" — untrue since v5.127/5.128. `server/routers/authRouter.ts` has bcrypt signup, login and change-password. That table is what someone reads to size the work of leaving Manus, and it currently overstates it by a whole login system.
- [ ] `server/backup.test.ts` uses `"bidrender-backups"` as a fixture bucket name. Harmless test data — the real bucket is `bidsoftware` — but it is now the last place that string survives, so it will read like the configured value to whoever finds it next.
- [ ] Decide whether v5.129 (the docs-only R2 key-replacement commit) belongs in `CHANGELOG.md`. Skipped at the time because nothing about the app's behaviour changed, which is the exemption CLAUDE.md allows.

## Migration cutover — DigitalOcean App Platform

- [x] Delete the old HelixBid Anthropic API key once the app is live on DigitalOcean and Manus is shut off. Deleted 2026-09-16. The live site runs on its own `ANTHROPIC_API_KEY`, verified working the same day.
- [x] Set a monthly spend limit on the Anthropic workspace — BidRender production, $50/month with an email alert at $25 (set 2026-09-16). The app's own limits cap one person per day; this is the only one that caps the account.
- [x] Set `ANTHROPIC_API_KEY` in the DigitalOcean environment. Confirmed set 2026-09-16, and verified on the live site after the v5.142 deploy — "Ask about this sheet" answers questions.
- [x] Set `CRON_SECRET` on DigitalOcean and, byte-identical, via `wrangler secret put CRON_SECRET`. Done 2026-09-17. Byte-equality was proved rather than assumed: a hand-triggered POST to `/api/scheduled/backupToR2` carrying the value from `.env.production.local` was accepted (200) by the live site before the Worker was given the same value. Note `.env` holds a DIFFERENT `CRON_SECRET` for local dev — taking that one is the easy mistake, and it fails silently, because the app's refusal is deliberately identical to every other refusal.
- [x] Fill in `APP_BASE_URL` in `workers/cron/wrangler.toml` and `wrangler deploy` the cron worker. Done 2026-09-17. Both triggers confirmed attached (`0 9 * * *`, `30 10 * * *`), and the times were moved from 02:00/03:30 UTC to 09:00/10:30 UTC so they land overnight Pacific rather than early evening. The Worker had to be deployed from a real terminal: registering the account's workers.dev subdomain is an interactive prompt, and a non-interactive shell answers "no" to it every time — see the comment in `wrangler.toml` for the full trap.
- [x] Set `PLAN_STORAGE=r2` plus the `R2_PLANS_*` values, so plan files go to Cloudflare rather than Manus.
- [x] Add a CORS rule on `bidrender-plans` for the live origin, exposing `ETag` — an upload in pieces cannot be reassembled without it. Verified 2026-09-16: a preflight from `https://bidrender.com`, `https://www.bidrender.com`, the `ondigitalocean.app` host and `http://localhost:3000` returns 204 with the origin allowed, and a real ranged GET exposes `ETag,Content-Range,Accept-Ranges,Content-Length`.
- [x] Set `R2_PLANS_READONLY_ACCESS_KEY_ID` and `R2_PLANS_READONLY_SECRET_ACCESS_KEY` on DigitalOcean, so the backup reads plans from R2 rather than buffering them through Manus. Confirmed 2026-09-16 in the App Platform settings: both present, encrypted, Run-time scope. This was the gate on v5.141 reaching `main` — group C removed the backup's fallback route for reading plans, so without these two keys the first nightly backup after the deploy would refuse outright.

## Manus removal — what is left

- [ ] Remove the dead Manus branch inside `server/_core/storageProxy.ts`. Since v5.141 it only ran when the storage backend was `manus`, which is no longer a backend, so it cannot be reached. **The `/manus-storage` web address itself stays exactly as it is** — it is written into `bid_pdfs.url` and the legacy `projects.pdfUrl` for every file already stored, so renaming it would break every existing plan link at once. It serves disk and R2 now; only the name is historical.
- [ ] Remove `BUILT_IN_FORGE_API_KEY` and `BUILT_IN_FORGE_API_URL` when the Manus AI fallback in `server/_core/llm.ts` goes. Nothing else needs them once that and the proxy branch above are gone. Neither is set on DigitalOcean, so that fallback is already dead on the live site — the app runs on `ANTHROPIC_API_KEY`. They are still read by `server/_core/env.ts`, which is what defines `ENV.forgeApiUrl` / `ENV.forgeApiKey`.

### Docs (group F)

- [x] `references/backups.md` § 4 — replaced the `manus-heartbeat` registration with the Cloudflare Worker sequence. Done 2026-09-17. Now carries the real order (`wrangler deploy`, THEN `wrangler secret put CRON_SECRET`), the five-field UTC times with their Pacific equivalents both sides of the November clock change, why the purge stays 90 minutes behind, and where to look in the dashboard. Points at `workers/cron/wrangler.toml` for the subdomain trap rather than repeating it.
- [x] `references/deploying.md` § 7 — same rewrite. Done 2026-09-17. The six-field seconds-first format is gone from both files; Cloudflare rejects it outright.
- [x] Sweep the rest of `references/` for Manus-era platform instructions. Done 2026-09-17. Findings recorded as the items below rather than fixed, so each can be judged on its own.
- [x] `references/disaster-recovery.md` rewritten for DigitalOcean + Cloudflare. Done 2026-09-17. It had gone wrong in the two most expensive ways a recovery plan can: it said login was OAuth-only and had to be rebuilt from scratch — untrue since v5.127/5.128, bcrypt sign-in restores with the database — and that `server/storage.ts` presigns through Forge, untrue since v5.141. Someone following it on a bad day would have budgeted weeks for work already done.

**Found by the sweep — actively misleading (a reader would take a wrong action). All eight fixed 2026-09-17 (v5.146); kept with their findings so the next reader can see what was wrong and judge the replacement:**

- [x] `references/backups.md` § 1 and § 2 both say the backup "falls back to reading through Manus" when `R2_PLANS_READONLY_*` is missing, and that "the Manus reader is still there". There is no Manus reader since v5.141 — the backup **refuses to start**. As written, a missing key reads as survivable when it stops backups dead. Worst of the set, and in a file that was otherwise just brought up to date.
- [x] `references/deploying.md` § 1–§ 4 describe the entire deploy procedure as: push to GitHub, then open a Manus session, run a pre-flight in the sandbox, `git pull`, save a checkpoint, press Deploy. None of that exists. Pushing `main` auto-deploys DigitalOcean now. A reader would either wait for a deploy step that never comes, or believe `main` has not shipped when it already has.
- [x] `references/deploying.md` § 6 recommends the navigation helper as the cheapest post-deploy probe "because it exercises `BUILT_IN_FORGE_API_KEY`, which exists only on deployed infrastructure". The app runs on `ANTHROPIC_API_KEY`; the Forge variables are not set on DigitalOcean at all. The probe is still a good one, for a different reason.
- [x] `references/deploying.md` § 8 — "Four Manus services the app cannot run without… Leaving Manus means replacing all four, including building a login system." Wrong on both halves: it already left, and the login system exists. This is the table someone reads to size the work, and it overstates it by an entire authentication rebuild.
- [x] `references/deploying.md` § 9 attributes the CORS rule to "the bucket behind `BUILT_IN_FORGE_API_URL`" and calls it "a Manus-side setting". It is the `bidrender-plans` R2 bucket, and it was configured 2026-09-16.
- [x] `references/environment.md` § 2 and § 6 say the Forge variables do double duty as object storage AND the LLM gateway, and that replacing storage means rewriting `storagePresignPut` / `storageGetSignedUrl` to sign against your own bucket. Both functions are gone. Storage is disk or R2 behind `server/storage.ts`, and adding a third backend means implementing four operations, not editing a router. Would send someone building what already exists.
- [x] `references/environment.md` § "Plan files — bucket `bidrender-plans`" says "Nothing reads these yet; they are slots for the R2 storage backend." Those are the live production storage credentials.
- [x] `references/environment.md` § R2 note still says "Every backup was taken by hand, and stays that way until the new host is running." Automatic since 2026-09-17.

**Found by the sweep — stale but harmless (historical record, or already labelled):**

- [ ] `references/periodic-updates.md` documents the Manus scheduler end to end — `manus-heartbeat`, AGENT cron, `user.isCron`, six-field expressions. Low priority **only because it already opens with a prominent header saying all of it is historical and describing what replaced it.** That header is what makes it honest rather than dangerous. Worth trimming eventually; do not remove the header before then.
- [ ] `references/database-digitalocean.md` mentions Manus throughout, almost all of it accurate history of how the DigitalOcean database was built and why it was not restored from the old one. Only the line saying plan files are "still Manus storage; replacing it is its own job" is stale.
- [ ] `references/backups.md` § 1 points the reader at `deploying.md` § 8 for "four Manus services" — a pointer to one of the wrong entries above. Fix alongside it.
- [ ] `references/takeoff-spec.md` — the two matches are the ordinary word "forget". No action; noted so the next sweep does not re-check it.
- [ ] `references/environment.md` § 1 lists `DATABASE_URL`, `JWT_SECRET` and the three OAuth variables as coming from "Manus environment settings" — they come from DigitalOcean now. Noticed 2026-09-17 while fixing § 2 and § 6, and deliberately left: only the source column is wrong, and the harder question sitting underneath it is whether `OAUTH_SERVER_URL` / `VITE_APP_ID` / `VITE_OAUTH_PORTAL_URL` still belong under "the app will not work without these" at all, now that sign-in is email and password. `VITE_OAUTH_PORTAL_URL` may still crash `AuthGuard` when absent; that wants checking against the code rather than assuming, and it overlaps Manus removal group B (`getLoginUrl`, `oauth.ts`). Fix the column and answer the question in one pass.

## Test suite health

**The three-command ritual that used to be here is gone — 2026-09-18.** It said
to flip `DISABLE_AI_FEATURES` in `.env`, run the suite, and flip it back. A check
that has to be remembered, performed and then undone is a check nobody performs,
and the undo was the dangerous step: forgetting it leaves a dev server able to
spend money.

**`vitest.setup.ts` now decides the AI environment itself**, unconditionally, and
blanks `ANTHROPIC_API_KEY` while it is at it. A suite's environment must not be
inherited from whoever's `.env` it happens to run under, and with the flag on,
a suite that ever forgot a mock would spend real money on every run. Both lines
are commented where they sit.

> **FIXED 2026-09-26 — the suite is 0 failures on `bidrender_test_clean`.**
> `server/v545.test.ts` failed 8 tests there with
> `companies_ownerUserId_users_id_fk`: written in the Manus era, it acted as a
> hand-built user `id: 1` — the owner's real account on the old dev database —
> and the scratch database has no user 1. It now inserts its own fixture user
> (5450), builds its context from that row as read back, and deletes it after.
> **Six more of its tests had been passing while testing nothing**
> (`if (!createdId) return;`), so the real count broken was 14, not 8; those
> guards are assertions now. The remaining non-passes are 4 deliberate
> `skipIf(!hasGateway)` model checks, and the `[BackupToR2] FAILED` line in the
> output is a passing test exercising that failure path.

**The baseline is now 0 failures.** The last 3 were all in `backup` and needed a
database grant rather than a flag; granted 2026-09-19, and `server/backup.test.ts`
now runs 32 passed / 0 failed. See below for what the grant was.

- [x] Grant the `bidrender` MySQL login rights to create the scratch schemas the backup tests and the verify tool need. Not a code fault and not fixable in the repo. (Was 26 across three files until 2026-09-18, when `vitest.setup.ts` took over the AI environment and `planCopilot` (21) and `navigation` (2) went green; 35 across five files before that, when the `bidrender_test` schema was behind.) Worth finishing because a suite that always shows red teaches people to stop reading it — which is how a real regression gets through.

  **This entry named one schema and there are five, which is why granting it and rerunning kept leaving failures on the board.** Confirmed 2026-09-19 by running the suite: the first failure reports `Access denied for user 'bidrender'@'127.0.0.1' to database 'bidrender_verify_selftest'` — not `bidrender_backup_restore_test`, the only name this entry used to give. The full set is `bidrender_backup_restore_test` (`server/backup.test.ts:246`), `bidrender_verify_selftest` (`:595`), `bidrender_verify_corrupt` (`:634`), `bidrender_verify_mismatch` (`:666`), and `bidrender_backup_verify` (the default in `server/backup/verifyBackup.ts:67`, used by `scripts/verifyBackup.mts`). The login holds `ALL PRIVILEGES` on `bidrender_local` and `bidrender_test` only, and bare `USAGE` globally, so it can create none of them.

  One grant covers all five, now and later — note the escaped underscore, because `_` is a wildcard in a MySQL grant pattern and an unescaped one would match far more than intended:

  ```sql
  GRANT ALL PRIVILEGES ON `bidrender_%`.* TO 'bidrender'@'127.0.0.1';
  FLUSH PRIVILEGES;
  ```

  Done 2026-09-19. **Run it against port 3307, not 3306.** Two MySQL servers run on
  this machine from the same `mysqld.exe`: the `MySQL80` Windows service on 3306,
  and the app's own instance on 3307 started by `BidRenderLocalstart-mysql.cmd`
  with `--defaults-file=BidRenderLocalmy.ini`. They have separate data folders,
  so separate `mysql.user` tables and separate root passwords — 3307's is in
  `BidRenderLocalpasswords.txt`. Granting on the wrong one fails with
  `ERROR 1410 ... not allowed to create a user with GRANT`, because `bidrender`
  does not exist on 3306 at all. Check with `SELECT @@port, @@datadir;` before
  granting; an access-denied from the wrong server looks just like a bad password.

- [ ] `server/backup/verifyBackup.ts` built its scratch connection with `mysqlConnection(scratchDatabaseUrl)` and no environment argument, so it inherited `DATABASE_CA_CERT` — **production's** certificate — and applied it to whatever local server the restore was pointed at. Fixed 2026-09-19; `VERIFY_DATABASE_CA_CERT` now covers a scratch server that needs its own TLS.

  Worth keeping as a written-down shape rather than a closed ticket. It was dormant for as long as `DATABASE_CA_CERT` was unset and broke the moment production moved to a managed database — the failure was `self-signed certificate in certificate chain` from the LOCAL server, naming a certificate that belongs to the database not being restored into. Nothing about the message points at the cause. The nightly verification would have failed the same way and just as quietly, leaving backups that nobody was confirming. Proved by changing that one variable and watching the error become a different one.

## Working on this repo — traps

**Running an OLDER build's tests against the shared test database puts the
old catalog names back.** Found 2026-09-26.

The suite starts the seeders, and a seeder only knows the names in its own
checkout. Point a worktree at an earlier commit — which a deploy of part of
`local-dev` does, to test exactly what is shipping — and it sees
`#8 XHHW aluminum` missing (the newer build renamed it) and inserts it as a
fresh row. Every later run of the current code then finds BOTH spellings, and
`renameBaselineMaterials` correctly refuses to merge them. On
`bidrender_test_clean` that left 46 stray rows, and
`materialsCatalog.test.ts > renames the reshaped rows in place` failed on a
catalog that was fine.

**It is a test-database fault, not a catalog one.** Production cannot get into
this state, because only one build seeds it at a time and never an older one
after a newer. To confirm rather than assume: restore a production backup,
start the build that is shipping against it, and check that no baseline row is
left on an old spelling.

**Repair:** list the baseline rows whose name is a key of
`RENAMED_BASELINE_MATERIALS` while the new name also exists, check nothing
references them (`assembly_materials`, forks via `baselineId`, run types,
`takeoff_groups`), and delete them. **Avoid it:** give an old-commit test run a
database of its own — `CREATE DATABASE … CHARACTER SET utf8mb4 COLLATE
utf8mb4_unicode_ci`, then `scripts/migrate.mts` against it, since a server
default collation fails at 0055.

**`users.lastSignedIn` reads back SEVEN HOURS in the future. Do not compare it
to the clock by eye.**

Found 2026-09-19 while working out whether a sign-in had succeeded. Read
straight out of the table it looked like the account had signed in seven hours
from now, which is the sort of thing that sends the next reader hunting for a
clock bug, a bad write, or a corrupted row. None of those is happening.

**What is actually going on.** The column is a `TIMESTAMP`, so the MySQL driver
timezone-converts it on the way out; `now()` is not a column and comes back
unconverted. `server/databaseConnection.ts` sets no `timezone`, so the gap is
exactly the machine's UTC offset — seven hours on PDT. The two values are
simply not in the same frame, and neither one is wrong on its own.

**Compare inside SQL, where both sides are in the database's frame:**

```sql
select email,
       timestampdiff(SECOND, lastSignedIn, now()) as secondsAgo
  from users
 where email = 'you@example.com';
```

A negative `secondsAgo` that is close to your UTC offset in seconds (25200 on
PDT, 28800 on PST) is this, not a real future timestamp.

**Why it is not being fixed today:** `lastSignedIn` is written in four places
(`authRouter.ts` signup and login, `_core/oauth.ts`, `_core/sdk.ts`) and **read
by nothing** — not retention, not analytics, not the UI. So it misleads a person
reading the table and costs the app nothing. If anything ever starts reading it,
fix the frame first, because every stored value is ambiguous until then.

**A failed sign-in leaves no trace anywhere. There is nothing to look at.**

Also found 2026-09-19. `authRouter.login` throws `UNAUTHORIZED` on both a
missing account and a bad password, and logs neither. There is no tRPC
`onError` handler, so nothing reaches the console either. The only auth line the
dev server ever prints is `[Auth] Missing session cookie`, which is an
unauthenticated page load — **not** a rejected login, and easy to mistake for
one.

The practical consequence: the only way to tell a successful sign-in from a
failed one, after the fact, is that a success writes `users.lastSignedIn` and a
failure writes nothing. That works for one known account and does not scale to
"a user says it will not let them in", where there would be no record that they
ever tried. Worth a counter or a log line before anyone but the author is
signing in; deliberately not built today.

**A single stray NUL byte makes `grep` skip a whole source file, silently.**

Found 2026-09-19 in `shared/materialsList.ts`, which had one NUL where a space
belonged, in the middle of an ordinary template string on line 142:

```ts
const key = `${material.name.trim().toLowerCase()}${material.unit}`;
//                                                 ^ this was a NUL, not a space
```

**Why it matters more than a typo.** ripgrep and grep treat any file containing
a NUL as binary. They do not search it and they do not error — `grep -rn` prints
`Binary file shared/materialsList.ts matches`, or with common flag combinations
prints **nothing at all**. So every repo-wide search that should have found
something in that file came back empty, and came back empty _confidently_. This
project's whole working method is "grep the reference files and the code before
specifying anything" (CLAUDE.md § Where decisions live). A file that cannot be
grepped is a file whose decisions are invisible to that method.

It had been there long enough that earlier searches touching this file were
lying. Nothing in the app misbehaved: the NUL worked fine as a map-key
separator, so there were no symptoms at all.

**How to spot it.** A file that `grep` calls "binary" when it is plainly source,
or a search that finds nothing where you are sure something is. To confirm and
locate:

```bash
file shared/materialsList.ts        # says "data" instead of "JavaScript source"
perl -ne 'print "$.\n" if /\x00/' shared/materialsList.ts   # the line number
```

To sweep the whole tree for others (there were none):

```bash
for f in $(find client/src server shared drizzle workers scripts -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' -o -name '*.mts' \)); do
  perl -ne 'exit 1 if /\x00/' "$f" || echo "NUL: $f"
done
```

**`git stash` is not safe in this checkout. Do not use it.**

> **A hook now refuses it** — `.claude/hooks/block-git-stash.mjs`, wired up in
> `.claude/settings.json`, denies any Bash command containing `git stash` and
> prints the worktree alternative. Added 2026-09-18 because this entry was
> written, read, and then ignored twice on the same day: a warning in a file you
> have to go looking in is not available at the moment the command is typed. The
> rule is also in CLAUDE.md now, which is read every session. **The recovery
> commands below stay here** — they are what you need when it has already
> happened, and that is a moment for a reference, not a guard rail.

Hit 2026-09-18:
`git stash push --include-untracked` reported failure, and left a state where
the stash entry EXISTED, the tracked modifications were still in the working
tree, and the untracked files had been **deleted from disk**. Half-applied in
the one direction that loses work — the files it removed were the only copies.
Almost certainly OneDrive: the folder is inside `OneDrive\Documents`, and the
sync client holds handles on files while git is trying to move them.

> **2026-09-24:** the working copy moved to `C:\dev\BidPhase`, outside OneDrive,
> so this checkout no longer has the cause. The hook stays anyway — CLAUDE.md
> § "Use `git worktree`, not `git stash`" says why.

**If it has already happened, the work is recoverable and here is where.** An
untracked file lives in the stash's third parent, which `git stash show` does
not list:

```bash
git show --name-only --format="" stash@{0}^3      # what was taken
git checkout stash@{0}^3 -- path/to/file          # bring one back
git reset -q HEAD path/to/file                    # un-stage it again
git diff stash@{0} --stat                         # empty = tracked files match too
```

Check that last one before dropping the stash. Then don't reach for stash again:
to test something against a clean tree, use `git worktree add` — a separate
directory, so nothing touches the files you are working in.

- [ ] Make `pnpm test` pass on a clean checkout so the workaround above can be
      deleted. Tracked under "Test suite health" above; noted here too because
      this is the section someone reads when something inexplicable happens.

**Four tables are on a different collation from the other 49, and the next
join against one of them will fail with no clue why.** Found 2026-09-18 while
writing the phase 6 backfill.

Every table in this schema is `utf8mb4_unicode_ci`. The DATABASE default is
`utf8mb4_0900_ai_ci`, and drizzle-kit's `CREATE TABLE` names no collation — so
a new table silently takes the database's instead. These four did:

- `ai_usage_daily`
- `bid_mounting_heights`
- `takeoff_height_defaults`
- `takeoff_mounting_heights`

**Nothing is broken today.** It only bites when a string column of one of them
is compared with a string column of an older table, and nothing does that yet.
When something does, MySQL refuses the whole statement:

```
ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations for operation '='
```

which says nothing about tables, columns or why, and lands wherever the query
runs — including inside a migration, mid-file, with earlier statements already
applied. That is exactly how it was found: the backfill joined a new table's
`label` to an old table's `assemblyName` and stopped on statement 4 of 4.

- [ ] Decide whether to convert these four to `utf8mb4_unicode_ci`. **Not
      urgent, and not obviously worth it**: `ALTER TABLE … CONVERT TO CHARACTER
SET` rewrites a live table, which is real risk for a problem nothing is
      currently hitting. The cheap half is already done — every new table names
      its collation explicitly (references/deploying.md § 5, and
      `drizzle/0053_worried_puppet_master.sql` as the worked example) — so the
      list above can only shrink, never grow. Read this entry before writing a
      query that joins one of their text columns to anything older.

**`pnpm test` WRITES TO WHATEVER `DATABASE_URL` POINTS AT, and in this
checkout that is the local dev database.** Hit 2026-09-18 — the suite was run
twice against `bidrender_local` before anyone read the warning `.env` carries
in its own header.

The mechanism, because it is not obvious from either file: `vitest.config.ts`
sets `setupFiles: ["dotenv/config", ...]`, so **every test run loads `.env`**.
`vitest.setup.ts` then fills only what `.env` did not supply (`||=`), so it
never overrides the database. There is no test database and no mocking — the
suites create, update and delete real rows, seed the baseline tables, and use
fixture user ids (4242/9999, 4243/9998) that they delete on the way in.

**What that costs.** Not much here, because `.env` points at the private MySQL
on port 3307 and the fixture rows are already all over it. It would cost a great
deal if `DATABASE_URL` ever pointed somewhere real, which is exactly why
`pnpm dev` refuses to read `.env.production.local` and why
`scripts/loadPlansEnv.mts` filters `DATABASE_URL` out of what a local run may
borrow. **The test runner has no such guard.**

To run the suite without touching the dev database, give the run its own
database — the value is what matters, not where it comes from, since
`dotenv/config` will not overwrite a variable already set:

```bash
DATABASE_URL='mysql://user:pass@127.0.0.1:3307/bidrender_test' pnpm test
```

`pnpm db:push` against that same URL first, once, to create the tables.

- [ ] Create `bidrender_test` and make it the default for `pnpm test`, so the
      safe path is the one you get by typing the obvious command. A guard that
      has to be remembered is not a guard. Until then, treat a bare
      `pnpm test` as "this writes to my dev data" — it does.

**Audited 2026-09-18 and left alone: the Manus Forge gateway's copy of the same
bug.** `server/_core/llm.ts` destructures a fixed list of `InvokeParams` fields
exactly as `invokeAnthropic` did, so a field added to that type goes nowhere
there either. It was NOT given the compile-time guard, for two reasons: `_core/`
is generated platform scaffolding that CLAUDE.md says to extend rather than
rewrite, and the branch is dead in production — `server/llm/index.ts` picks
Anthropic whenever `ANTHROPIC_API_KEY` is set, and it is set in
`.env.production.local`. Worth knowing rather than worth fixing; if the Forge
path is ever revived, give it the same treatment first.

- [ ] Delete the Manus Forge gateway path entirely (`server/_core/llm.ts`, the
      `BUILT_IN_FORGE_API_KEY` env var, and the lazy import in
      `server/llm/index.ts`). It cannot run in production and it carries a
      second, unguarded copy of the parameter-dropping bug that cost real money
      in the Anthropic adapter. Part of the "Manus removal" work above rather
      than its own job — noted here because the audit is what found it.

## Plan viewer overhaul

- [ ] Give the plan reader zoomed-in tiles of a sheet rather than one shrunk image. Observed on the live site 2026-09-16: on dense sheets it runs, costs a call, and comes back having found no symbols — its own answer said the symbols were not legible at the resolution it was given. So this is not a prompt problem or a model-tier problem; it is being handed a picture in which the thing it is looking for does not survive. A receptacle symbol is a few dozen pixels on a full E-sheet scaled to fit a model's input, and downscaling removes it before the model ever sees it. Likely shape of the fix: render each page at takeoff zoom, cut it into overlapping tiles, read each tile, then merge the hits back into page coordinates — overlapping because a symbol on a tile seam would otherwise be halved and missed twice. Watch the cost: one sheet becomes N calls, so the per-person daily allowance in `shared/aiLimits.ts` is counting something much larger than it was designed around, and `PLAN_COPILOT_MODEL` is the expensive tier. Do this as part of the plan viewer overhaul, not before — the tiling wants the same render path the viewer is getting. **N is 6, and the rest of the cost question is answered: `references/ai-reader-cost.md` (2026-09-18) prices it on the real Old Blueridge sheets.** Decided there: Sonnet 5 at 150 px per paper inch, thinking off, 6 tiles, ~10.1c a sheet, 150 sheets a month inside the $99 flat price.

- [ ] Change `DAILY_LIMITS` in `shared/aiLimits.ts` from counting CALLS to counting SHEETS, plus a dollar backstop — 40 sheets and $6 per person per day. **In the same commit as the tiling above, and not before it.** Today one sheet is one call, so the current 150 is correct for how the app actually spends; changing it early would make the limit describe an app that does not exist yet. The moment a sheet is six calls, 150 calls means 25 sheets and a 40-sheet set dies two-thirds of the way through. Reasoning in `references/ai-reader-cost.md` § 7; the point is that once a sheet is several calls, "calls" stops tracking spend and spend is the only thing the breaker is for.

- [ ] Give the conduit and cable layer swatches in `LayersPanel` the conduit-yellow and cable-emerald that every other surface uses. Noticed 2026-09-18 while making the run icons agree (v6.22). `layerColor` in `shared/takeoffLayers.ts` derives a colour by hashing the layer key against a fixed palette, so the Conduit-runs and Cable-runs swatches come out at whatever the hash lands on — while the tool buttons, the counted-items rows and the traced lines on the drawing itself all use `#F5C518` for conduit and emerald for cable. The panel that exists to say which of those lines you are looking at is the one surface that does not match them. **The fix touches how EVERY layer colour is derived, not just these two** — the same function colours the location layers, which have no natural colour of their own and want to stay visually distinct from each other, so it probably becomes "named colours for the keys that have one, hash for the rest" rather than a two-line change. That is why it is its own pass and not a tidy-up inside an icon commit. Same family as the icon mismatch it was found beside: one thing per concept, and this one is colour rather than shape.

- [ ] **There is no way to take a takeoff out of the app as numbers.** Asked 2026-09-19, and it is a door the product promised early: numbers come off the plans and go into whatever the estimator already uses. Two CSVs exist and neither is it. The **materials list** (Takeoff → "Materials list" → CSV, and the same dialog on the bid) is a SUPPLIER document — quantities with no prices, and `shared/materialsList.ts` has nowhere to put one on purpose; traced runs arrive in it as one lump of conduit, one of cable and one of wire, because nothing carries the run TYPE through to it. The **accounting export** (`shared/accountingExport.ts`) is the bid's money in QuickBooks invoice shape, with cost and margin deliberately absent. What is missing is the takeoff itself: **every count by type with its quantity, and every run by type with its traced, vertical and extra footage**, per sheet and for the bid, with the sheet each came from. Most of it is already computed — `takeoffGroups.list` has the counts, `takeoffRuns.totals` has the footage, `shared/csvWrite.ts` writes the file — so this is a new shape over existing numbers rather than new arithmetic. **Two things to get right:** it is an internal document, so unlike the supplier list it MAY carry prices, and the choice of whether it does has to be explicit rather than inherited from whichever builder was copied; and it must say what it does not include, the way the materials list already does about verticals and extra. See `references/plan-viewer-overhaul.md` § 5j for the extra footage it will have to show once that exists. **Build § 5n first** — an export of run footage by type, taken from a palette in which no type names a material, writes rows that carry a name and no specification.

- [ ] **Typecheck the tests.** `tsconfig.json` excludes `**/*.test.ts`, so `pnpm check` — the correctness gate — covers no test file at all. Measured 2026-09-20: making one field required produced 0 errors from `pnpm check` and 28 from a config that includes tests; after fixing those, **33 pre-existing errors remain across ten test files** (`server/pricing.test.ts` 7, `server/auth.email.test.ts` 4, `client/src/lib/tradeContent.test.ts` 4, and the rest in ones and twos). **Re-measured 2026-09-26: 124 errors across 23 files** — it has nearly quadrupled in six days, because nothing checks it. Largest: `server/takeoffMath.test.ts` 38, `server/materialMarkupAgreement.test.ts` 26, `server/accountingExport.test.ts` 12, `server/takeoffVerticals.test.ts` 8, `server/pricing.test.ts` 7. `server/v545.test.ts` had 2 and is now clean. Measured with a tsconfig that extends the real one and drops only the `**/*.test.ts` exclusion. **The growth is the argument for doing this soon:** every week it waits, the piece gets bigger. **Why it matters more than it looks:** every forcing function added on 2026-09-20 — the required field, the props union, the row-taking mapper — is enforced in `server/`, `shared/` and `client/src/` and is silently absent in the tests, so a fixture can construct a shape the production code cannot. That is the difference between a type-level guarantee and a type-level suggestion. **Do it as its own piece, not inside another change:** the 33 have to be read individually, and the failure mode of hurrying is a test "fixed" by weakening what it asserts. Flip the exclusion, fix them, and the gate finally means what CLAUDE.md says it means.
  - **2026-09-26: 124 → 4**, one commit per file (21 commits, `db116dd`..`72c11fa`), each with that file's test count identical before and after, no cast / `any` / `@ts-ignore`, no assertion weakened. The recurring causes were fixtures behind a type that grew (`separateGround`, `productivityPct`, `materialMarkup`, four `User` columns), `Partial` being shallow, read-backs typed `| undefined`, a nullable `breakdown` (from `88270df`), and the missing `target` below.
  - [x] **`server/takeoffBridgeFlow.test.ts` — fixed 2026-09-26, `3e8e973`.** The fork assertion read `forked!.id`, `undefined` because `assemblies.update` returns `{ assembly, forked }`, so that one assertion could never fail; it is now `expect(forked.assembly?.id).not.toBe(baselineId)`. **Correcting what was written here before:** "the test proves nothing" was too strong. Measured against an update made never to fork, the OLD test still went red — two assertions later, on a snapshot-hours mismatch (`expected 0.5 to be 1.25`), blaming the wrong thing. The new line fails at the fork itself (`expected 14391 not to be 14391`). The missing `category` was stated as `"Devices"`, which is what MySQL had been storing (measured, even under strict mode).
  - [x] **`server/permissions.test.ts` — the shipped type defect, fixed and deployed 2026-09-26, `e899092`.** The two `as unknown as [CompanyRole, …]` casts in `companyRouter.ts` are gone; `role: "owner"` is now a compile error and the `@ts-expect-error` lines are used. **Correcting the fix proposed here before:** no literal tuple was needed and `shared/permissions.ts` did not change — the cast was a zod 3 workaround, and zod 4's `z.enum` takes the already-correctly-typed filtered array. Emitted JS for the file is byte-identical, so the runtime refusal is the same code; checked live before and after the deploy (owner refused by `invalid_value` against `["admin","estimator","viewer"]`, the three normal roles invite).
  - [ ] **`tsconfig.json` sets no `target`.** Its only visible effect so far: iterating a Set, Map or `matchAll`, and top-level `await`, do not compile, so the codebase uses `Array.from(...)` (now in tests too). Deliberately not changed in passing: Vite and esbuild read `target` (it sets the default for `useDefineForClassFields`), so it can change how shipped classes compile. Decide it on purpose. **It is also what keeps `scripts/` out of `pnpm check`:** measured 2026-09-26, including all of `scripts/` reports 43 errors in 11 files, 42 of them this (39 top-level `await`, 2 iterations, 1 top-level `for await`) and 1 ordinary type error (TS2345). `migrate.mts` and `schemaDrift.mts`, both run against production during a deploy, are among them. Settle `target`, fix the one, then add `scripts/**/*` to `include`.
  - [x] **Flipped the exclusion — 2026-09-26.** `pnpm check` now compiles every test file (`server/**`, `client/src/**`, `scripts/**/*.test.ts`) under the same `compilerOptions`. Verified: clean on the codebase (534 files, up from 379 — the 151 tests, the 2 scripts they import, a JSON fixture and `pricing/movedFromSheet.ts`, both imported by tests); a planted error in a test fails it (exit 2, naming the line); warm run ~3.8 s → ~4.2 s, cold unchanged within noise; shipped output byte-identical once the build timestamp and the filename hashes it feeds are normalised (23/23 files, old config vs new).

## Material markup (references/material-markup.md)

- [ ] **Piece 2 — price bands.** Needs a PACK size / pack price on `materials` first (D3): bands key on the roll, the stick, the box, never the per-foot price. Then band rows in `markup_rules`, the D2 starter set (Route A only, dated, inert until accepted), and the shared starter-accept component (D6) that labor units will reuse. `getMarkupRuleSet` skips unaccepted starters already; `resolvePartMarkup` already walks bands, and returns "no rule" only because `packPrice` is always null today.
- [ ] **Piece 3 — categories.** A categories table (shipped + a company's own) and a nullable `materials.categoryId` read before the enum. The engine already reads category rules keyed by the category NAME, and there is no screen to write one. D5 overrides "Category is NOT user-extendable" and has to answer its clutter concern: a company's own category must not become a takeoff layer on every sheet by accident.
- [ ] **Pieces 4 and 5 — route A/B, the combined number, the blended markup.** Not started. The bid screen shows a "Material markup" row and "Profit 15% markup = 13% margin"; the combined effective margin and the blended material markup are still to come.
- [ ] **A per-LINE markup override on one bid.** Not in any piece yet. The item override is company-wide; the "one-way door" rule in CLAUDE.md says anything from the library can be overridden on one job. Wants a nullable column beside `snapshotMarkupPct` and a field on the line.
- [ ] **Re-apply on a line from before markup rules reads its parts from TODAY's links** — its assembly's current recipe, or the material its run type names now — because such a line stored no composition. After one re-apply it stores its parts like any other line. A line priced from a material by hand (bidsRouter `priceLineFrom`) that predates markup has no link to that material at all, and re-applies at the company default.
- [ ] **Dashboard vs bid screen still differ on a bid whose plan quantities moved since they were sent** (bid 1164558 in the local copy: card $192.58, bid $378.15). Not markup: three of its lines are traced-run lines STORED at 0 ft, which the bid screen resolves live from the drawing (`getBidLineItems` → `withPlanCounts`) and the dashboard's SQL reads as stored. Checked 2026-09-25 against the rows. Found by the same before/after dump that found the marked-up-expense gap. Pre-existing; not fixed.

## Lines that can't be priced (shared/linePricingProblems.ts, shipped 2026-09-26 as 88270df)

- [ ] **Analytics leaves a broken line out and does not say so.** `costSums` gates every per-line figure on `lineIsPriceable`, so analytics agrees with the bid screen, and it returns a `brokenLines` count, but `toBidCostRow` drops it and no analytics screen shows an "incomplete" marker. On production today there are 0 bid lines at all, so nothing is affected. Carry `brokenLines` through `BidCostRow` and mark the affected figures before a real company's history can contain one.
- [x] **Admin screen for the references — shipped 2026-09-26 as 66d9961.** "Pricing problems" on the Admin screen: `pricingProblems.list` / `counts` / `find` (all `adminProcedure`, cross-company); `recent` was replaced. The contractor-facing `lookup` is unchanged and company-scoped.
- [ ] **A contractor has no lookup screen of their own.** `pricingProblems.lookup` exists for them and is tested, but the reference only ever appears on the bid it belongs to, so there has been no need yet.
- [ ] **A live check of money agreement needs a PRICED fixture on the smoke account (1421).** Its first assembly is an unpriced starter, so the 2026-09-26 live check compared $0 with $0: it proved the bid opens and the card and bid agree, not that they agree on real money. That was proven locally (the suite, and the screen at $800 = $800). Price one assembly on 1421, or have the check create and delete one.
- [ ] **"Missing reference" is not detected, on purpose.** A line whose takeoff group or run type has vanished cannot happen: both are `RESTRICT` foreign keys, and `resolveLineQty` falls back to the stored quantity rather than zero. If either key is ever relaxed, that fallback becomes a silent wrong quantity and wants to be a problem code here.
- [ ] **Not a breaker-panel feature.** The request that produced this asked for per-PANEL isolation; there is no panel entity (a panel is a catalog material, an assembly, or a free-text circuit label). Isolation was built one level down, per bid line, where panels already live. A real panel schedule (panels → breakers → circuits) would be a new feature and needs a spec first.

## Seat limits (shared/seats.ts, shipped 2026-09-26 as 1952c2f)

- [x] **Seats per company, enforced at invite, accept and restore; admin sets the limit.** 0080 added `companies.seatLimit` (default 1); 0081 raised every company to what it uses. Production after 0081: companies 1, 2 and 3 each 1 of 1 — all three had one member and no pending invites.
- [x] **Run types were already company-wide.** Filed under `ctx.scope.dataUserId` (the owner) since v6.40. Production and local had no run type under a non-owner. The router comment that said "scoped to the USER" was the likely source of the belief; corrected, and `seats.test.ts` pins it.
- [ ] **The Crew page calls a REVOKED invite "expired".** `TeamPage.tsx` branches on `acceptedAt` then `usable`, so anything unusable and unaccepted reads "expired", including a code revoked a second ago. Seen on the live site 2026-09-26. A false statement rather than a blank; the fix is a `revokedAt` branch, then look at it on screen.
- [ ] **A billing plan should set `seatLimit` through `db.setSeatLimit`**, so a downgrade hits the same "remove N first" refusal. Nothing else writes the column today except 0081.
- [ ] **Nobody but a platform admin can add a seat.** "Remove someone or add a seat" names an action an owner cannot yet take themselves; it becomes self-serve with billing.

## Fittings counted from the trace (shared/runFittings.ts, built 2026-09-26)

**DEPLOYED 2026-09-26 as `99b8c4e`** (rollback target `1952c2f`). 0082 and 0083
applied to production before the push; schema drift clean at 84. Rehearsed on
backup `2026-09-26T18-27-04Z` — results in `references/deploying.md` § 5b.
Live checks as the smoke account on www.bidridge.com: 1,190 active shipped rows
(the account sees 1,184 because six of its own deleted copies hide their
shipped rows); "emt coupling" lists set-screw first at every size; a 40 ft EMT
run on bid 25 sent 3 couplings, 2 connectors and 5 straps with their
sentences, every line read "Not priced" and the strip said 4 lines were left
out; the supplier list itemised the three fittings. The test lines, run and
sheet scale were removed afterwards — production back to 0 bid lines, 2 runs.

- [ ] **Old disconnect and breaker spellings land on the renamed row SECOND.**
      "30A fused disconnect" now matches the new NEMA 1 row and the renamed
      NEMA 3R row equally, and the tie goes to NEMA 1; "30A breaker" ties
      with "30A 2-Pole breaker". Live since `1c29584`. Whether the old
      spelling should prefer the renamed row is a ranking decision.
- [ ] **A comma in a search finds nothing.** "#12 bare copper, solid" returns
      no rows while "#12 bare copper solid" finds it — the tokenizer keeps
      the comma on the word. Found by `scripts/catalogRehearsal.mts search`;
      not caused by any rename. Also `5/6" wafer LED downlight` (the old
      spelling) reads as a fraction and finds nothing.

Couplings (sticks minus one per leg, drops included), connectors (one per
conduit end, by node degree) and straps (one near each box, then spacing)
reach the bid through Send, the markup engine and the quantity lock. D17(b)'s
per-end labour interim is retired — it was never built, so no number moved.
`scripts/fittingsImpact.mts` reports what a release does to existing bids.

**Before deploying — the rename needs its rehearsal.** This is a catalog
release: EMT couplings and connectors are renamed in place to "set-screw"
(`RENAMED_BASELINE_MATERIALS`: 18 new entries, and the 2 older
`EMT connector 1/2"` spellings re-pointed straight at the final name), and
63 rows are new — 36 compression/raintight EMT fittings and 27 one-hole
straps; the catalog is 1,190 rows (counted from `BASELINE_MATERIALS`
2026-09-26). Check it against a
restored copy of production with the build that ships, together with the
other pending rename rounds, per `references/deploying.md` § 5b. And 0082 and
0083 are both step 1 (additive): apply them before the push. 0083's backfill
fills only its own new column and is guarded on NULL. Then run
`scripts/fittingsImpact.mts` against production for the fitting counts; it
refuses to count without 0082. (Run 2026-09-26 without 0082: production has
2 bids, 2 untyped runs and no bid lines, so nothing there is affected.)

- [x] **BUILT 2026-09-26 on `local-dev`, NOT DEPLOYED: bends and pull points**
      (D19 in `references/takeoff-spec.md`). Eight commits, `c648f9b` to the
      docs commit. **Before it can go live:**
  - **0084 is step 1 (additive): apply it BEFORE the push.** Two new tables
    (both name `utf8mb4_unicode_ci`), nullable columns, enum values appended;
    no UPDATE. Step 3 is empty. Applied to `bidrender_local` and
    `bidrender_test_clean`; a second run applies nothing.
  - **It is a catalog release: 45 new baseline rows (the 45° elbows), no
    renames.** Rehearsed on `bidrender_local` only (1192 -> 1237, VERDICT
    CLEAN). Rehearse on a restored copy of PRODUCTION with the build that
    ships, per `references/deploying.md` § 5b, with the other pending rounds.
  - **Every field bend reads "Not priced" until hours are set.** No raceway
    ships `fieldBendLaborHours`; it is set per pipe on the Materials screen
    ("Field bend \_\_\_ h each").
  - The design as it was written before the build, kept for the record:
- [ ] **Double counting: a user's own assembly that already holds an elbow or
      an LB.** Now that the trace counts elbows and LBs, a company whose own
      assembly includes one (a panel feed with its 90s, say) will count it
      twice once the run's elbow reaches the bid. **No guard, by decision**
      (owner, 2026-09-26, answer 6) — the same stance as connectors below.
      No starter assembly carries an elbow, LB or pull box (searched the seed
      by those names). Worth a guard if it shows up in practice.
- [ ] **Field-bend and elbow hours may already be inside a pipe's per-foot
      labor unit.** A company whose EMT hours come from a book that folds in
      bends would count bending twice. Nothing moves by default (every shipped
      unit is NULL). The editor says "per bend"; worth a sentence on the
      Materials screen if a company reports it.
- [ ] **Other run-type lines still print "0 h" when their material has no
      labor unit.** The send flattens a NULL unit to 0 (`runLinePricing`), so
      the bid cannot tell it apart afterwards. Field bends keep the NULL and
      show "— h" (`lineHoursUnset`); the rest predate this build.
- [ ] **LB covers and gaskets, LL/LR/T/C bodies and PVC sweeps are not in the
      catalog.** Sweeps wait for an Underground category (answer 2).
- [ ] **Three local tables are on the wrong collation** —
      `ai_usage_daily`, `bid_mounting_heights`, `takeoff_mounting_heights`
      (reported by `scripts/schemaDrift.mts` on `bidrender_local`, 2026-09-26).
      Pre-existing, not from 0084; `deploying.md` has the CONVERT statements.
- [x] (The design as planned — two lines turned out wrong, marked.) **NEXT
      BUILD: bends and pull points.** Decided by the owner 2026-09-26.
  - **Bends from the trace geometry, in plain code, no AI:** each corner's
    measured angle, plus one 90 at each counted vertical drop. Legs already
    carry `points` and `drops` for this (`FittingLeg`), so it adds an
    `"elbow"` `FittingKind` rather than reshaping the input.
    > **Wrong, as built:** it DID reshape the input. A pull point at the top
    > of the END drop needs to know which end, and splitting a leg needs each
    > drop's feet, so `drops: number` became two `EndDrop`s. And "elbow" is
    > five kinds: `elbow90`, `elbow45`, `fieldBend`, `lb`, `pullBox`.
  - **A company setting: "factory elbows from this size up"**, default
    1-1/4". Below it, bends are field-bent — labor only, no fitting. PVC
    always uses factory elbows or sweeps. The size comes from the raceway's
    shipped name (`parseRacewayName`) compared through
    `shared/materialSizeOrder.ts`, never arithmetic on the text.
  - **Pull points:** add up the degrees of bend along each run. When the
    total passes the company limit (default 360°, the code max; 270° as an
    option), PROPOSE an LB or pull box at the spot where it tips over —
    proposed and marked on the drawing for approval, the same as drops,
    never added silently.
    > **"The same as drops" named nothing that existed:** drops have no
    > propose-and-approve flow today. Pull points are the first; they borrow
    > the plan reader's dashed-means-proposed convention, and their answers
    > live in `takeoff_pull_points`.
  - **Bend counts read "at least N"**, since plans do not show the kicks and
    offsets at boxes.
- [ ] **Fitting styles for the other families.** EMT has set-screw /
      compression / raintight. Still to add: FMC (squeeze vs screw-in), LFMC
      (straight vs 90, and the style picker for it), PVC (glue vs threaded
      adapter), and whatever else a family needs. PVC and RMC/IMC already
      count by their own rules (belled; coupling on each stick) without a
      picker.
- [ ] **Locknuts and bushings** at each connector (RMC/IMC, and EMT into a
      panel). The rows exist (`conduit bushing`, `conduit locknut`); nothing
      counts them yet.
- [ ] **PVC expansion fittings** on long exposed PVC runs.
- [ ] **MC cable connectors and straps.** MC needs the same counting — a
      connector at each end, straps at 6 ft and within 12 in of a box — and
      `countFittings` can serve it; the catalog has no MC connector rows by
      size yet, and cable types have no fitting slot.
- [ ] **FMC/LFMC straps.** Flex carries a strap spacing (4.5 ft / 1 ft) but
      `strapFamily` returns null for flex, so flex straps say "No catalog
      strap" until sized flex straps ship.
- [ ] **Double counting from a user's own box assembly.** No starter assembly
      carries a connector or strap, so nothing overlaps today. A company
      whose own box or device assembly includes an EMT connector will count
      that connector twice once the run's end connector reaches the bid. No
      guard, by decision (2026-09-26); worth one if it shows up in practice.
- [x] **DECIDED AND BUILT 2026-09-26: yes, Send-again refills a "Not priced"
      line, never a set price, never on a locked bid; and a style change
      swaps fitting lines on Send-again with the swap named in the preview.
      `shared/resendLine.ts`, `bid_line_items.runMaterialId` (0083), and the
      R4 note in `references/takeoff-spec.md`. The question as it stood:**
      **Does Send-again re-price a line that was sent unpriced?** A
      run-type line freezes its price at send (R4). A fitting sent while its
      catalog row was $0 therefore stays "Not priced" on that bid after the
      row is priced, and the only way out is removing the line and sending
      again. Re-snapshotting a $0 snapshot on Send-again would fix it without
      touching any price somebody chose — but it is an exception to R4 and
      the owner's call.
- [x] **(Resolved with the item above.) Changing a type's fitting style does
      not change lines already on a bid** — still true, by decision; Send-again
      now swaps them. The original note: Their material is frozen with their price (R4), the same as
      changing a type's raceway. The preview shows the new part while the
      bid line keeps the old name. Same decision as above, really.
- [ ] **The proposal still prints money per unit/section** without the
      "Not priced" treatment bid lines now have. Check what a client-facing
      proposal should say when a line inside it is not priced.
