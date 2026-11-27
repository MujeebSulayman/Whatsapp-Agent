# Base styles: what we use and why

The dashboard's base stylesheet (`frontend/app/globals.css`) builds on Tailwind's Preflight and adds the rules
that Preflight does not cover. Researched Nov 2026.

## Already provided by Tailwind Preflight
Preflight is built on modern-normalize: `box-sizing: border-box`, zeroed margins, block-level media, forms inheriting font.

## What we add, and the source of each idea
| Rule | Why | Source |
| --- | --- | --- |
| `color-scheme` on `:root` | Native controls, scrollbars and dropdowns follow the theme | MDN, "Using media queries for accessibility" |
| `text-size-adjust: none` | Stops mobile browsers inflating text on rotate | Andy Bell's modern reset |
| `min-height: 100dvh` on body | Correct height with mobile browser toolbars | Josh Comeau's reset / modern CSS |
| `text-wrap: balance` (headings), `pretty` (paragraphs) | Nicer line breaks, fewer orphans; not applied to `*` for performance | Chrome developer typography guidance |
| `:focus-visible` outline, never removed | Keyboard users always see focus | MDN / W3C accessibility guidance |
| `prefers-reduced-motion` | Respect OS setting (vestibular disorders) | Andy Bell's reset, MDN |
| `scroll-padding-top`, `:target { scroll-margin }` | Anchors don't hide under sticky headers | Andy Bell's reset |
| `touch-action: manipulation` | No 300 ms tap delay / double-tap zoom on controls | Common mobile practice |
| `accent-color`, `::selection`, `::placeholder` | Consistent themed form details | Modern CSS |
| `forced-colors` | Windows High Contrast keeps controls visible | MDN |
| `@media print` | Orders print without the navigation | Common practice |
| `font-variant-numeric: tabular-nums` on tables | Money columns line up | Typography best practice |

## Sources
- Andy Bell, [A (more) Modern CSS Reset](https://piccalil.li/blog/a-modern-css-reset)
- Josh W. Comeau, [Custom CSS Reset](https://www.joshwcomeau.com/css/custom-css-reset/)
- Tailwind, [Preflight](https://tailwindcss.com/docs/preflight)
- sindresorhus, [modern-normalize](https://github.com/sindresorhus/modern-normalize) and csstools, [sanitize.css](https://github.com/csstools/sanitize.css)
- Jake Lazaroff, [My Modern CSS Reset](https://jakelazaroff.com/words/my-modern-css-reset/)
- Chris Coyier, [The Coyier CSS Starter](https://frontendmasters.com/blog/the-coyier-css-starter/)
- DEV, [5 modern CSS features your reset sheet is probably missing in 2026](https://dev.to/effeilo/5-modern-css-features-your-reset-sheet-is-probably-missing-in-2026-4l16)
- MDN, [Using media queries for accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility)
