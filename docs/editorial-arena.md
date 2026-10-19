# Editorial arena redesign

Arcline reference: https://8bsite.github.io/fitness-website-template/

Original XGamer composition: inset stadium hero, staggered Space Grotesk and italic serif type, orbital brand graphic, numbered editorial chapters, real league counts, match publishing state, large linked journey rows, and community finale. Retains the existing Barlow Condensed brand, all eight centralized social destinations and Discord invite.

Motion uses existing Motion for section entry and route transitions; GSAP/ScrollTrigger is loaded only for desktop visitors without reduced motion. Transform-only hero parallax and orbital scrub use native scrolling. Touch scrolling, keyboard anchors, text selection and browser find remain native. All content renders before animation and without JavaScript. Reduced-motion changes revert GSAP effects. Mobile omits the GSAP download and uses a stacked composition.

Hero photography: https://images.unsplash.com/photo-1522778119026-d647f0596c20 (Unsplash; locally stored and optimized with Next Image). No Arcline assets or source were copied.

Validation: 21 existing tests pass; TypeScript, ESLint and production webpack build pass. Local Turbopack fails with a worker process crash; the supported webpack build succeeds. Browser verified desktop image, homepage, existing match empty state, all 14 player records, eight footer destinations, no horizontal overflow, and no captured browser errors. Mobile CSS and reduced-motion paths reviewed; physical-device and throttled 60 FPS benchmarking remain unverified.

Existing limitations are preserved: no published fixtures at verification time; registration and new admin controls remain gated pending identity/private-storage setup. Existing Sanity publishing and tournament planner are unchanged.
