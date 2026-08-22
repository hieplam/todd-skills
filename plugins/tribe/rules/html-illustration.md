---
description: >-
  House style for HTML whose job is to SHOW something to a human reader — an
  explainer, illustration, report, dashboard, or diagram page produced because a
  wall of text cannot carry the point. Fixes container width, type scale, reading
  measure, panel caps, diagram scaling, theming and spacing, calibrated for a
  2560×1440 desktop. Read it BEFORE the first line of markup or CSS. Applies
  equally to a published Artifact, a standalone .html written to disk, and a
  rendered mermaid illustration. Does NOT apply to production application markup,
  templates, or test fixtures — see the gate.
paths:
  - "**/*.html"
  - "**/*.htm"
---

# HTML illustration house style

## Gate — decide this FIRST, before reading the rest

This rule is scoped by glob to HTML files, but the glob is only the outer filter. The
real filter is semantic, and it is this:

> **Apply this rule when the page *is* the explanation** — when HTML was chosen because
> prose could not show the thing, and a human is going to look at the rendered page as
> the deliverable.

Both must hold:

1. **The page is the artifact a human reads.** Its purpose is to make the reader see or
   understand something — a mechanism, a comparison, a set of numbers, a flow, a plan.
2. **The assistant is authoring it for the reader**, rather than editing markup the
   codebase owns and ships.

**Applies to:**

- An Artifact published for the user to read (report, memo, audit, plan, explainer).
- A standalone `.html` written to disk for the user to open in a browser.
- A rendered mermaid illustration page — including the output of the `explaining` skill's
  `render-illustration.ts` (its Rule 4: illustrate a flow instead of narrating it).
- A one-off dashboard, comparison table, benchmark write-up, or diff walkthrough.
- HTML emitted from a template in another language (a `.ts` renderer, a heredoc in a
  shell script): the rule governs the **emitted document**, not the host file.

**Does NOT apply to:**

- Production application markup, page templates, partials, or component fixtures the
  repo owns — those follow the repo's own design system, which always outranks this file.
- Email templates, snapshot/test fixtures, generated vendor output.
- Any page where the user has specified their own layout or brand.

**Layering.** When a design skill is already in play (`artifact-design`, `dataviz`), that
skill decides *treatment* — which visual register the page belongs to, and how to ground
the palette in the subject. This file then fixes the *numbers* on top of it. When no such
skill is in play, this file is the whole specification.

## What this fixes — and what it deliberately leaves open

Fixed here: **structure and scale** — container width, type scale, reading measure,
panel caps, diagram scaling, spacing rhythm, theming, the mobile reset. These are the
values that were being re-decided ad hoc on every page and landing wrong.

Not fixed here: **palette and typeface**. Those must still be derived per subject, every
time. Two pages built under this rule should share a skeleton and look visibly different.
If a hex value ever appears in this file, that has defeated the point — revert it to a
description.

## Palette bias — a lean, not a token set

When the subject does not pull the palette somewhere more specific, lean toward a
**latte + green** family: a warm milky neutral base (cream, tan, latte — not pure white,
not flat grey) with a green accent anywhere from sage through olive to forest.

Re-derive the actual shades from the subject each time. The green accent must hold up in
both themes; the milky-latte neutral is naturally a light-theme ground, so for dark mode
derive an analogous **warm** dark ground — a near-black with a brown or green cast, never
a cold near-black and never a blue-leaning navy.

Skip the bias entirely when the subject argues for something else. It is a starting lean
for the otherwise-unopinionated case, not a rule.

## Container

```css
.wrap { max-width: min(1780px, 94vw); margin: 0 auto; padding: 0 40px 120px; }
```

The 1780px cap governs on desktop and 2K screens; `94vw` takes over below a ~1894px
viewport so tablet and mobile never lose their edge margins.

**Do not fall back to a ~700–900px "document" column.** That measure is sized for a laptop
window and leaves most of a 2K screen empty — it is the single most common way these pages
come out wrong.

## Type scale

Set the scale on the **root element**, not just `body`, so every `rem`-based rule
(headings, labels, table text, chips, callouts) scales together from one number:

```css
html { font-size: 20.7px; }   /* baseline 18px × 1.15 */
body { font-size: 21.85px; line-height: 1.65; }  /* baseline 19px × 1.15; 1.65–1.7 */
```

| Role | Size |
| --- | --- |
| Body text | `body` font-size (~22px) |
| Eyebrow / small-caps label | `0.8–0.85rem`, `letter-spacing: 0.1em`+ |
| Lead paragraph / thesis / definition line | `1.25–1.35rem`, `line-height: 1.55–1.6` |
| Section heading (h2) | `clamp(1.9rem, 2.1vw, 2.5rem)` |
| Page title (h1) | `clamp(2.6rem, 3.4vw, 3.8rem)`, or larger |
| Code / data (mono) | `0.85–0.98rem` inside panels; `0.87em` inline |

To rescale the whole page later, multiply the two root px values and stop — every `rem`
rule follows automatically. Only fixed-`px` values (the panel and diagram caps below)
need a manual bump.

## Reading measure — the one place "wider" is wrong

The container is wide so that **panels** have room. Prose must not stretch across it:

```css
p       { max-width: 72ch; }
ul, ol  { max-width: 68ch; }
```

A wide container with a narrow-capped text column is the intended look — the generous
whitespace beside the prose is the design, not a bug to fill.

## Supporting panels — evidence blocks, code panels, callouts, tables

Anything holding code, quotes, or structured content gets more room than prose but still
stops short of the full container so it stays scannable:

```css
.evidence, .diagram-wrap, .callout { max-width: 1360px; }  /* 1180px baseline × 1.15 */
```

Internal padding `22–30px`. Panel body text and code at `0.95–0.98rem` — the tight
`0.8rem` that reads fine in a narrow column goes illegible once a panel is this wide.

## Diagrams — the gotcha that is not optional

A mermaid renderer emits its SVG at a small, roughly fixed intrinsic size **regardless of
how wide the container is**. Widening the container alone does nothing for diagram
legibility; the SVG itself must be forced to scale:

```css
pre.mermaid, div.mermaid { background: transparent; display: flex; justify-content: center; }
pre.mermaid svg, div.mermaid svg {
  width: 100% !important;
  max-width: 1265px !important;   /* the panel cap × 1.15 */
  height: auto !important;
}
```

Add this **every time the page contains a diagram** — do not wait for it to look wrong
first. Cover both selectors: the Artifact viewer renders `<pre class="mermaid">`
natively, while a standalone page loads mermaid itself and conventionally uses
`<div class="mermaid">`.

Delivery differs by target, the scaling rule does not:

| Target | Mermaid delivery |
| --- | --- |
| Artifact | Rendered natively from a ```` ```mermaid ```` fence or `<pre class="mermaid">` — no library to load |
| Standalone `.html` | Load mermaid from CDN at view time and pin the major version; the diagram sits in `<div class="mermaid">` |

## Spacing rhythm

- Major section vertical padding `64–72px`, with a hairline `border-top` between sections.
- Sub-section label divider: `~35–40px` above, `~15px` below.
- Paragraph bottom margin `~16px`; list-item bottom margin `~8px`.

## Theming — cover both delivery modes with one block

An Artifact viewer stamps `data-theme="dark"` / `"light"` on the root element for an
explicit choice and stamps nothing on "system". A standalone page opened from `file://`
has no stamp at all — only `prefers-color-scheme`. One token block satisfies both:

```css
:root { /* the COMPLETE light palette, as tokens */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* redefine only the tokens */ }
}

:root[data-theme="dark"] { /* the same dark tokens, so an explicit toggle wins */ }
```

Never give a color its only definition inside a media or `[data-theme]` block, and always
paint `body` an explicit token background — a transparent body borrows the host's ground.

## Mobile breakpoint — reset, don't shrink proportionally

```css
@media (max-width: 900px) {
  html { font-size: 16px; }
  body { font-size: 17px; }
  .wrap { padding: 0 20px 72px; max-width: 100vw; }
  .evidence, .diagram-wrap, .callout { max-width: 100%; }
  pre.mermaid svg, div.mermaid svg { max-width: 100% !important; }
}
```

Panels and diagrams capped narrower than the container on desktop go **full width** on
mobile, where there is no excess container width to protect them from.

## Self-contained, always

One file that renders correctly with no local build step: inline the CSS and JS, embed
images as `data:` URIs. Give the page a real `<title>` — it names the browser tab and,
for an Artifact, the gallery card. Wide content (tables, code blocks, diagrams) scrolls
inside its own `overflow-x: auto` container; the page body never scrolls horizontally.

The one allowed remote dependency is a viewer-time library the page cannot inline and
still work — mermaid on a standalone page being the standard case. Everything else that
needs the network is a defect: the page must render from `file://` on a plane.

## Checklist before shipping any page under this rule

1. Root scale set per the Type scale table — not reinvented from a 16px/17px default.
2. `.wrap` set to the Container rule; no 800px document column.
3. Prose capped at 66–72ch regardless of container width.
4. Supporting panels capped at ~1300–1400px, not the full container.
5. Any diagram on the page carries the SVG scaling override — added preemptively.
6. Both theme paths defined (`prefers-color-scheme` **and** `[data-theme]`), `body`
   background painted from a token.
7. Mobile breakpoint present, releasing the panel and diagram caps.
8. Colors and typefaces derived fresh from the subject; latte + green as the lean when
   nothing else pulls, never a copied swatch.

## Reviewer severity guide

- Prose column that ignores the reading measure, or a page-wide `~800px` document column
  on a page this rule governs → **Should-fix**.
- A mermaid diagram with no SVG scaling override → **Should-fix** (it is illegible at 2K,
  which is the whole reason this rule exists).
- A theme defined only under `prefers-color-scheme`, or a `body` with no painted
  background → **Should-fix**.
- Missing mobile breakpoint → **Should-fix**.
- Exact px values inside the stated ranges, choice of typeface, or a palette that departs
  from the latte + green lean for a subject-grounded reason → **Optional**; the ranges are
  the contract, not the individual numbers.
- Applying this rule to production application markup → **the rule was misapplied**;
  re-read the gate.

## Calibration

Calibrated 2026-08-02 against a 2560×1440 (2K/QHD) desktop viewport. The previous default
— a ~780px centered column at 17px body text — read as cramped and left most of the screen
empty; container width was roughly doubled and the whole type scale lifted ~15% on top of
that. These are the current calibration point, not a permanent law: nudge them again if a
page still reads too small, and update this section with the new date and reason when you
do.
