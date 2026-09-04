# Example design brief

Request: design a wedding invitation that helps guests understand the story,
event details, and RSVP path without feeling like an admin dashboard.

Inputs: mobile-first web, portrait photography, one primary RSVP action, date and
venue details, map link, family-language toggle, and an unknown final guest count.

Reasoning workflow:
1. Choose an editorial-romantic direction with warm neutrals, a serif display face,
   and a calm sans-serif body face.
2. Make the hero, event facts, story, and RSVP the primary hierarchy.
3. Use cards only for scannable facts; keep photography and type dominant.
4. Preserve story order and RSVP visibility on narrow screens.
5. Use gentle section reveals and disable them under reduced-motion preferences.

Expected output: tokens, page hierarchy, component/state inventory, responsive
rules, and implementation notes for the detected stack. Explicitly reject neon
gradients, glassmorphism, decorative UI chrome, and inaccessible text over photos.
