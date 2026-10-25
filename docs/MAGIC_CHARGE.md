# Charge your magic: precision circle tracing

Point your index finger toward the screen with the other fingers curled. A golden circle appears on the mirrored camera preview. Trace it in either direction; a green trail shows your fingertip's path. Each completed attempt shows accuracy, completion time, and a score out of 100. The best attempt during the 6.7-second event counts.

Accuracy is 80% of the score: radial error against the target is measured in image-width coordinates, so the target stays circular in the 4:3 preview. Speed is 20%, scaled from 400 ms to 5 seconds. Higher scores win. Rounded-score ties use accuracy, then completion time; exact ties draw. A perfect first attempt does not end the event early, so both players can finish.

The tracker requires an extended index finger and curled middle, ring, and little fingers. It follows landmark 8 (the index tip), not the palm. A valid trace needs nearly a full revolution, closure, coverage of at least 22 of 24 angular sectors, and consistent direction. Tiny circles, waves, shortcuts, invalid frames, and open palms cannot score. Brief pose flicker is tolerated for 150 ms; longer loss, frame gaps over 300 ms, leaving the target, camera restart, and mode changes reset the partial path.

The camera is required. Space, Enter, and taps do not score this event. Enable camera and Reset circle tracking controls are available in the event. Training has a Magic charge button. `/gesture-test` has a tracing detector test; the match camera includes the target/trail.

The client sends a bounded fingertip path through `CIRCLE_TRACE`. The server validates it, recomputes the score, associates it with the current clash and authenticated socket, and retains improvements only. Video and full hand landmarks stay local; the existing face snapshots still go to the rival. The wire struggle kind remains `pump`.

Tests cover point-pose gating, circle completion, inaccurate movement, score weighting, invalid/stale paths, best-attempt retention, synchronized online scoring, timeout winners, and desktop/mobile UI. A synthetic hand detector exercises the complete camera-to-game scoring path. Real webcam recognition still needs a hands-on check in the intended lighting.
