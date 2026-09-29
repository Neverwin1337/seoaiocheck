# 雙軌網站檢測 Design System

## 0. Research Log
- Embedded references: shortlisted IBM, Sentry, PostHog; selected taste-skill + IBM for its precise analytics typography and tonal separation. Use inspiration, not IBM branding.
- UI/UX database: queried "seo audit dashboard analytics clean"; single primary input followed by scan-friendly result metrics.
- Lazyweb: unavailable for viewed screens in this environment; no third-party screenshots copied.
- Imagen: no image generation tool available; this is an operational diagnostic surface, so live score visualization is the visual focus.

## 1. Atmosphere & Identity
An efficient analyst's workbench: calm white space, graphite text and two distinctly colored measurement tracks. The recognizable moment is a pair of large scored rails with an aligned list of actions below, not a marketing hero.

## 2. Color
| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--canvas` | `#f7f8f8` | App background |
| Paper | `--paper` | `#ffffff` | Main surface |
| Wash | `--wash` | `#edf1f0` | Quiet surface |
| Ink | `--ink` | `#172423` | Headings |
| Muted | `--muted` | `#526260` | Supporting copy |
| Hairline | `--line` | `#d9e1df` | Dividers |
| Primary | `--accent` | `#155a4e` | CTA and focus |
| Primary hover | `--accent-hover` | `#0b4038` | Hover |
| SEO track | `--seo` | `#155a4e` | SEO score |
| GEO track | `--geo` | `#a25730` | GEO score |
| Error | `--error` | `#ad3939` | Form errors |

## 3. Typography
IBM Plex Sans, with system sans-serif fallback; IBM Plex Mono for scores and URLs. Display 42px/1.15 weight 400; heading 28px/1.25 weight 500; subheading 20px/1.35 weight 600; body 16px/1.55 weight 400; label 14px/1.4 weight 500; metadata 12px/1.4 weight 500. Letter spacing 0 throughout.

## 4. Spacing & Layout
4px base. Steps 4, 8, 12, 16, 24, 32, 48, 64px. Content max width 1120px; 24px desktop side gutters, 16px mobile. Main document owns vertical scrolling. At widths of 880px or less result columns collapse to one.

## 5. Components
### URL field and audit command
- Structure: visible label, URL input, submit button with icon; nearby inline error.
- States: idle, hover, active, focus-visible, disabled while loading, error.
- Accessibility: 48px minimum target, associated label, error announced in live region.
- Layout: cluster on desktop; vertical stack on mobile.

### Score rail
- Structure: source label, score out of 100, short description, fixed-height fill track.
- States: empty before audit, loading skeleton, score after audit, source failure.
- Accessibility: score and scale rendered as text; rail is decorative.
- Layout: two columns on desktop, stacked on mobile.

### Finding row
- Structure: origin tag, issue message, category, text severity label and a separate fix recommendation; groups of findings use simple dividers.
- States: populated or empty with explanatory copy.
- Accessibility: source and severity labels are text, not only color. SEO labels are native fail/warn statuses; GEO priorities are estimated from the matched category score, with unmatched items explicitly unranked.
- Layout: one readable column without nested cards.

### Report export actions
- Structure: two secondary buttons labeled HTML and JSON beside the audited URL.
- States: absent before a successful audit and during a new audit; hover, pressed, and focus-visible after completion.
- Accessibility: explicit file format in each accessible name; native buttons usable by keyboard.
- Layout: horizontal cluster that wraps beneath the URL on narrow screens.

## 6. Motion & Interaction
100-180ms opacity/transform feedback on button press and result entry. Loading uses a subtle progress strip; reduced-motion preference removes all nonessential movement. No decorative looping motion.

## 7. Depth & Surface
Tonal shift: canvas, paper, wash; hairlines mark list boundaries. No floating sections, decorative shadows or nested cards. The score rails are genuine repeated data items, not decorative cards.

## 8. Accessibility Constraints & Accepted Debt
WCAG 2.2 AA: body contrast 4.5:1, visible keyboard focus, labelled form, live status feedback, responsive zoom and reduced-motion support. Accepted debt: none.
