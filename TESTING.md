# Manual experience testing

Step-by-step checks to verify booking, security cues, and responsive layout for Lauren’s therapy site.

## Desktop – Chrome (1440px)
1. Load `/index.html` and confirm hero, CTA buttons, and reassurance badges render without scroll jank. **Result:** Pass.
2. Click nav links (Services, Approach, Book, FAQ, Contact) to ensure smooth scroll and anchor targets. **Result:** Pass.
3. Submit booking form with empty required fields to confirm inline errors show for every field. **Result:** Pass.
4. Submit booking form with valid data to confirm success message and form reset; confirm data stored in `localStorage` under `bookingRequests`. **Result:** Pass.
5. Toggle FAQ accordions to confirm disclosure behavior and focus outline. **Result:** Pass.

## Mobile – Chrome/Safari emulation (375px)
1. Tap menu toggle to open/close nav; ensure links close menu after selection. **Result:** Pass.
2. Verify hero and booking cards stack vertically with readable padding. **Result:** Pass.
3. Complete booking form using touch input; ensure inputs have touch-friendly targets and validation still works. **Result:** Pass.

## Firefox (desktop)
1. Confirm gradient backgrounds, buttons, and cards render as expected. **Result:** Pass.
2. Verify keyboard navigation: tab through links, form fields, and buttons; confirm focus states and accessible labels. **Result:** Pass.
3. Test `details` FAQ elements expand/collapse with keyboard and mouse. **Result:** Pass.

## Security & reliability checks
1. Load the site over `http://` and confirm automatic redirect to `https://` outside localhost. **Result:** Pass.
2. Confirm booking data persists in `localStorage` after refresh to assure follow-up continuity. **Result:** Pass.

## Discrepancies resolved
- Availability list readability: added shared `.muted` style to align text color with the design system.

