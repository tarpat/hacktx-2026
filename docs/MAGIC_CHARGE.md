# Charge your magic

Matching fireballs or ice spells randomly start either magic charge or the five-pose race. Draw a big circle with one hand, clockwise or counterclockwise. Each completed circle adds one charge to the existing server-authoritative tug of war. The leading wizard wins after 6.7 seconds; a lead within the draw margin fizzles both spells. The winner's spell absorbs both attacks.

The event shows a circular progress ring, a live camera preview with golden hand skeletons, tracking hints, charge counts, and the advantage bar. Training has a **Magic charge** button to start it directly. `/gesture-test` has **Test magic charge circles** for practicing detection without a match.

## Tracking and controls

The existing hand tracker supplies palm positions; no elbow tracking, body framing, or extra body model is needed. Closed loops must cover both axes, wind consistently, and take at least 350 ms. Small jitter, straight waves, reversed arcs, missing landmarks, duplicate frames, and jumps cannot complete a circle. Motion is tracked over a rolling 2.8-second window. Tracking loss, gaps over 300 ms, camera restart, hidden tabs, and mode changes reset the path. Either direction works and two detected hands are matched by proximity to avoid switching paths when detections reorder.

Camera input charges the local wizard. SPACE/tap remains available if the camera is off; ENTER scores the rival in training. Spell casting is suspended during the event, then waits for hands to relax before rearming. **Reset circle tracking** clears a partial loop; toggle the camera off/on to restart a stopped stream. The easy bot charges at roughly 0.65 circles per second.

The wire kind remains `pump` and uses the existing `STRUGGLE_PUSH` input, server rate limit, and synchronized scoring. Video and landmarks stay local; the existing small face snapshots still go to the rival.

## Verification

Counter tests cover clockwise/counterclockwise circles, repeated loops, ovals, hand reordering, false movements, interrupted paths, and invalid timestamps. Controller tests cover scoring, suspended casting, mode changes, and stale async detections. Browser tests cover desktop/mobile layouts, fallback controls, winners, and a blank synthetic camera that asks for a hand without scoring. Physical webcam accuracy still needs a check in the intended room lighting.
