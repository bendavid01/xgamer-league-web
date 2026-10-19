# XGamer interaction upgrade — 19 October 2026

Preserves the existing navy/cyan identity, public Sanity source and security boundaries. No new animation dependency was added.

## Behavior
- Short route entrances with shared navigation remaining interactive. Uses CSS for deterministic server/client rendering rather than delaying routing for exit animations.
- Mouse-responsive spring pitch artwork and finite broadcast-style entrances. No perpetual hero animation or per-pointer React renders.
- Keyboard/touch match disclosure with real goal distribution, published-result status and participant links. No invented possession or analytics data.
- Match filter enter/exit/reflow, standings row movement, bracket generation and round transitions.
- Mobile menu expansion, Escape dismissal and focus return; 44px primary controls, 16px mobile form text, visible focus, reduced-motion overrides and route skeletons.

## Verification
- 21 existing tournament/security tests pass; lint and TypeScript pass.
- Production build passes with `npm run build -- --webpack` on Windows. Default Turbopack has a local PostCSS worker startup failure; Vercel uses the unchanged default build command and is checked independently.
- Headless Edge 155: desktop and 360/390/768px touch viewports, route navigation, mobile Escape/focus, no horizontal page overflow and reduced motion pass. No runtime or console errors in the final production run.
- Isolated fixtures verified match disclosure, search/filter empty/recovery states, group standings, knockout advancement and champion. The temporary fixture route was removed before the release build and its absence was checked. Live source currently has 14 participants and zero published matches; match-specific checks therefore used sample fixtures, never production writes.
- Local production run: DOMContentLoaded 20ms, load 68ms, resource transfers 234,401 bytes; route click-to-heading times 36/44/32ms for matches/standings/players. Single run, no CPU/network throttling; timings include browser automation overhead and are not field Core Web Vitals or a before/after comparison.
- 119 requestAnimationFrame intervals during bracket round advancement: median 6.9ms, p95 7.2ms, none above 33.3ms. Headless scheduling is not a display FPS measurement or a guarantee of 60 FPS.

## Remaining verification
Physical Android/iOS touch behavior, low-end hardware, throttled mobile networks, screen-reader testing, field LCP/INP/CLS and large live datasets have not been measured. No published matches are available for a production-data match-card check. Root and standings skeletons are wired; no artificial server delay was introduced to force them into production.
