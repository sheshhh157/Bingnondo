---
name: Bingnondo Manager Dashboard
description: A live, read-only ops ledger for a single store — warm heritage paper, seal red, and ledger-precise components.
colors:
  seal-red: "#B91C1C"
  lantern-red: "#EF4444"
  bronze: "#92400E"
  aged-gold: "#B45309"
  pale-gold: "#FDE68A"
  rice-paper: "#FDF6EC"
  card-paper: "#FFFBF4"
  clay-surface: "#FAF0DC"
  tea-wash: "#F3E8D4"
  paper-border: "#E8D5B7"
  strong-border: "#C9A87C"
  ink: "#1A0A00"
  bark: "#78553A"
  court-blue: "#1D4ED8"
  court-navy: "#1E3A8A"
  court-bg: "#F1F5F9"
  court-card: "#FFFFFF"
  court-ink: "#0F172A"
  court-mist: "#E2E8F0"
  court-slate: "#475569"
  court-line: "#CBD5E1"
  court-wash: "#E8EFFB"
typography:
  display:
    fontFamily: "'Noto Serif TC', 'Songti SC', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 700
  title:
    fontSize: "0.95rem"
    fontWeight: 600
  body:
    fontFamily: "'Noto Sans TC', 'PingFang SC', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "99px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
components:
  button:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-primary:
    backgroundColor: "{colors.seal-red}"
    textColor: "{colors.rice-paper}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.seal-red}"
    textColor: "{colors.rice-paper}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge:
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Bingnondo Manager Dashboard

## Overview

**Creative North Star: "The Tea House Ledger"**

This is a shopkeeper's account book that happens to update live. Warm rice paper, ink text, and a single vermilion seal stamp's worth of red carry the whole interface; everything else is bark-brown small print and ruled hairlines. Density beats decoration: a manager glancing between tasks must read the state of four stations in seconds, so information packs tight in small exact type while the heritage palette keeps the rush feeling calm rather than clinical.

Busy ops clarity first, heritage second. The system is a working tool, not a gallery — sparse marketing whitespace is the confirmed anti-reference. Chinese-heritage identity shows in color and type pairing only, never in ornament.

**Key Characteristics:**
- Warm paper ground with ink text; one red, used like a seal stamp.
- Ledger-precise and quiet: small exact type, ruled hairlines, pill stamps of status.
- Dense but calm: tight grids and tables, generous only where the eye must rest (stat values, page titles).
- Flat at rest; depth is earned by state, never decoration.

## Colors

Warm heritage paper warmed further by seal red and aged gold; the manager station keeps a separate cool Azure Court world that never mixes with the red one.

### Primary

- **Seal Red** (#B91C1C): the single accent. Primary buttons, active nav, key figures, destructive states, focus rings. Used sparingly — its rarity is the point.

### Secondary

- **Lantern Red** (#EF4444): brighter signal red for the secondary token; rare live highlights only.
- **Bronze** (#92400E): deep bronze accent for hover states and secondary emphasis.
- **Aged Gold** (#B45309): gold for warnings, queue states, and heritage detailing.
- **Pale Gold** (#FDE68A): light gold tint for gold-tinted surfaces.

### Tertiary

- **Azure Court Blue** (#1D4ED8): primary of the scoped manager (`.mr-root`) theme only — deep imperial blue with aged gold, on cool slate paper. Never appears in the heritage-red world.
- **Court Navy** (#1E3A8A): secondary of the Azure Court theme.

### Neutral

- **Rice Paper** (#FDF6EC): page background; text on Seal Red.
- **Card Paper** (#FFFBF4): card and button surfaces, one breath lighter than the ground.
- **Clay Surface** (#FAF0DC): hover and wash surfaces.
- **Tea Wash** (#F3E8D4): muted fills — skeleton shimmer, subtle wells.
- **Paper Border** (#E8D5B7): hairline borders and dividers.
- **Strong Border** (#C9A87C): emphatic borders — button strokes, dashed empty states.
- **Ink** (#1A0A00): primary text, warm near-black.
- **Bark** (#78553A): secondary text, soft brown for labels and sub-copy.
- **Court Neutrals** (manager theme only): Court Paper (#F1F5F9) ground, Court Card (#FFFFFF) surfaces, Court Mist (#E2E8F0) muted fills, Court Line (#CBD5E1) borders, Court Wash (#E8EFFB) hover, Court Ink (#0F172A) text, Court Slate (#475569) secondary text.

### Named Rules

**The Seal-Stamp Rule.** Seal Red covers at most ~10% of any screen. Buttons, active states, and alerts earn it; everything else stays paper, ink, and bark.

**The Two Courts Rule.** The heritage-red world and the Azure Court blue world never share a screen. `court-*` tokens apply only under the scoped manager theme; introducing blue into the red world (or red into the blue one) is forbidden. Note: destructive/error red is Seal Red in both worlds by deliberate alias, not by mixing.

## Typography

**Display Font:** Noto Serif TC (with Songti SC, Georgia fallback)
**Body Font:** Noto Sans TC (with PingFang SC, system-ui fallback)

**Character:** The serif speaks only titles and figures of record — page headings, stat values — like brush-written ledger headings. The sans does all working text. Traditional Chinese glyphs set the tone; numerals inherit the same quiet precision.

### Hierarchy

- **Display** (700, 1.5rem, serif): page titles (`.ui-pageheader__title`), stat values (`.ui-stat__value`). The largest voice on any screen.
- **Title** (600, 0.95rem, sans): card and panel titles (`.ui-card__title`).
- **Body** (400, 16px, 1.5 line-height, sans): working text, table cells (0.85rem in dense tables), form controls.
- **Label** (600, 0.72rem, uppercase, +0.04em tracking, bark): table headers, stat labels, section labels, badges. The ledger's small print — always uppercase, always letterspaced.

### Named Rules

**The Ledger Hand Rule.** Serif is reserved for headings and figures of record. Body copy, labels, and UI chrome never set in serif.

**The Small-Print Rule.** Metadata, headers, and status always render as uppercase micro-labels (0.68–0.72rem, semibold, tracked). If it describes rather than states, it is small print.

## Layout

App shell is a full-viewport flex column: persistent sidebar navigation with sectioned link groups on desktop, main content column beside it. Content pages stack sections with a 20px rhythm; stat grids run four-across with 14px gutters; tables are full-width with collapsed hairline row dividers.

Responsive behavior collapses in stages, all observed in code: sidebar compresses to icons at 1100px; grids stack through 960px down to two-across at 640px; at 720px the sidebar yields to a top bar with a slide-in drawer; at 480px headers shrink, toasts go full-width, and tables scroll horizontally inside wrappers rather than reflowing. Spacing follows the 4-based scale (space-1 through space-8); page padding and card padding both sit at 16px.

## Elevation & Depth

Depth is tonal first, shadow second. Paper tones step down (Rice Paper → Card Paper → Tea Wash) to separate ground, surface, and well; hairline Paper Borders draw every edge. The three-step shadow scale exists but whispers: cards and stats rest with the barely-there sm shadow, and that is the ceiling at rest.

### Shadow Vocabulary

- **Rest** (`box-shadow: 0 1px 4px rgba(26,10,0,0.08)`): the only shadow permitted on resting surfaces — cards, stat blocks.
- **Lift** (`box-shadow: 0 4px 16px rgba(26,10,0,0.10)`): hover lift on interactive cards. Earned by pointer state.
- **Overlay** (`box-shadow: 0 12px 40px rgba(26,10,0,0.14)`): toasts and drawer overlays — things that arrive above the page.
- The Azure Court theme re-inks the same three steps in slate (`rgba(15,23,42,…)` at 0.07 / 0.10 / 0.13).

### Named Rules

**The Ledger Rest Rule.** Surfaces rest nearly flat: hairline border, tonal paper, at most the rest whisper-shadow. The lift and overlay steps are earned by state — hover, arrival, overlay — never applied as decoration.

## Shapes

Soft-cornered paper forms on a strict scale: 4px for tight controls, 8px for buttons and toasts, 12px for cards and empty states, 16px reserved for large panels. Status always takes the full pill (99px) — badges, payment chips, progress fills, connection indicators — and dots are true circles. Empty states use a dashed strong-border outline instead of a shadow to say "nothing here yet." Toasts carry a 4px solid left edge in the accent color as their only hard geometry.

### Named Rules

**The Pill-and-Hairline Rule.** If it reports status, it is a pill. If it contains, it is a hairline-bordered card. Neither borrows the other's shape.

## Components

Ledger-precise and quiet: small, exact, restrained — ruled lines and stamps, nothing shouts.

### Buttons

- **Shape:** gently rounded (8px radius).
- **Primary:** Seal Red fill, Rice Paper text, 8px 12px padding, 0.8rem type; hover only brightens slightly — no color change, no lift.
- **Hover / Focus:** default button warms to Clay Surface and takes a Seal Red border; transitions run 0.12s ease.
- **Secondary / Ghost:** the default button *is* the secondary — Card Paper fill, strong-border stroke, ink text. Danger exists only as a hover state (rose wash with destructive text).

### Badges

- **Style:** full-pill stamps, 0.72rem semibold, optional 6px currentColor dot.
- **State:** six fixed pairings — success (pale court wash / court blue), warning (pale gold wash / aged gold), danger (rose wash / seal red), info (pale sky / court blue), muted (sage wash / slate), gold (sand wash / dark ochre). Never invent a seventh; map new states onto these six.

### Cards / Containers

- **Corner Style:** large (12px).
- **Background:** Card Paper on Rice Paper ground.
- **Shadow Strategy:** rest whisper-shadow only; see Elevation.
- **Border:** 1px Paper Border hairline, always.
- **Internal Padding:** 16px; titles 0.95rem semibold with 12px below.

### Stat Blocks

- **Style:** card foundation with uppercase bark micro-label, serif 1.5rem value, muted sub-line.
- **State:** alert variant swaps to rose border on blush ground with destructive value; queue variant takes a sand border. Values never change size by state — color and border do the talking.

### Tables

- **Style:** full-width, collapsed, 0.85rem cells with 12px padding and hairline row dividers; headers are uppercase bark micro-labels with 10px 12px padding.
- **Behavior:** wrapped in horizontal scroll containers on narrow screens; rows never reflow into cards. Key cells (order id) set semibold in Seal Red.

### Toasts

- **Style:** card surface, medium radius, overlay shadow, 4px accent left edge (primary / destructive / aged gold by tone), title plus muted description, quiet close control.
- **Motion:** slides in from 30px right with fade over 0.25s ease. Fixed bottom-right, max 360px; full-width above small screens.

### Navigation

- **Style:** sectioned sidebar, uppercase bark section labels, links with icon plus two-line label/sub rows.
- **Default / Hover / Active:** rest is plain ink; hover washes Clay Surface; active lays a 10% primary tint, recolors icon and label to primary, semibold, with a 6px primary pip at the edge.
- **Mobile treatment:** top bar with brand and menu control; navigation becomes a slide-in drawer over a dim overlay, closable by X, overlay tap, or Escape.

### Inputs / Fields

- Page-level fields (date pickers, search) inherit body type on paper surfaces with strong-border strokes; no shared input primitive exists yet — new inputs follow the button's stroke-and-radius grammar (strong border, 8px radius, 0.85rem type).

### Signature Component: Live Connection Badge

- A pill stamp pairing a pulsing dot with micro-label text ("Live" / "Offline"), the system's honesty made visible: every live surface must show connection state in this form.

### Loader & Skeleton

- Loading shows three 8px primary dots bouncing in 0.15s stagger (1.2s loop); skeleton bars shimmer Tea Wash gradients. Both are quiet placeholders, never spinners with brand color fills.

## Do's and Don'ts

### Do:

- **Do** keep Seal Red at seal-stamp rarity — primary actions, active states, and genuine alerts only.
- **Do** set every label, header, and status stamp as uppercase tracked micro-type (0.68–0.72rem, semibold).
- **Do** rest surfaces flat with hairline borders; spend lift-shadows only on hover, arrival, and overlay.
- **Do** wrap tables in scroll containers on small screens; never reflow rows into cards.
- **Do** pair every live surface with the connection badge in its prescribed pill form.
- **Do** keep the Azure Court blue quarantined to the scoped manager theme.

### Don't:

- **Don't** introduce a CSS framework, a new font, or a seventh badge color — map onto the six stamps.
- **Don't** use decorative gradients, glassmorphism, neon, or cold SaaS grays anywhere except the skeleton shimmer, which is the single sanctioned gradient.
- **Don't** add shadows beyond the rest whisper to resting surfaces, and don't lift cards on hover unless they are interactive.
- **Don't** set body copy or UI chrome in the serif display face.
- **Don't** leave marketing-scale whitespace in ops surfaces; density is the aesthetic, calm is the restraint.
