# Charge your magic: precision circle tracing

Point your index finger toward the screen with the other fingers curled. A golden circle appears on the mirrored camera preview. Trace it in either direction; a green trail shows your fingertip's path. Each completed attempt shows accuracy, completion time, and a score out of 100. The best attempt during the 15-second event counts.

Accuracy is 80% of the score: radial error against the target is measured in image-width coordinates, so the target stays circular in the 4:3 preview. Speed is 20%, scaled from 400 ms to 5 seconds; slower completed circles still receive their accuracy score, for up to 14 seconds per attempt. Higher scores win. Rounded-score ties use accuracy, then completion time; exact ties draw. A perfect first attempt does not end the event early, so both players can finish.

The tracker follows the index fingertip with relaxed pointing checks to tolerate foreshortening toward the camera and imperfectly curled fingers. Open palms cannot acquire or advance the trace. A valid trace needs nearly a full revolution, closure, broad angular coverage, and mostly consistent direction. Short gaps count toward coverage; slight reversals and radial errors reduce accuracy rather than discarding a circle.

Brief pose flicker or missing frames pause the trace for up to 1.2 seconds, preserving the trail and progress. Single landmark spikes are ignored. Return near the trail's endpoint to resume. Going off the ideal ring no longer clears progress. Slow traces retain their starting point through sample thinning rather than dropping the oldest samples. Only sustained tracking loss, a 14-second attempt timeout, explicit reset, camera restart, or mode changes clear a partial trace.

The camera is required. Space, Enter, and taps do not score this event. Enable camera and Reset circle tracking controls are available in the event. Training has a Magic charge button. `/gesture-test` has a tracing detector test; the match camera includes the target/trail.

The client sends a bounded fingertip path through `CIRCLE_TRACE`. The server validates it, recomputes the score, associates it with the current clash and authenticated socket, and retains improvements only. Video and full hand landmarks stay local; the existing face snapshots still go to the rival. The wire struggle kind remains `pump`.

Tests cover point-pose gating, circle completion, inaccurate movement, score weighting, invalid/stale paths, best-attempt retention, synchronized online scoring, timeout winners, and desktop/mobile UI. A synthetic hand detector exercises the complete camera-to-game scoring path. Real webcam recognition still needs a hands-on check in the intended lighting.
