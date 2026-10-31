# L4 Writing

- Date: 2026-10-31

Two end-of-month calibration fixes on L4 labels, both under the owner rule that no label covers another. On a portrait phone a track name now sits 0.4 u higher (`L4_SIGN.phoneLift`): at its phone size it ended about 3 px above its bay's live spine title at the bay's stop, inside the 4 px placement gap, and lost the place, so the nightly sweep failed three nights running (issue #347); the unit sweep now builds the phone device's signs at their phone sizes, so a pull request catches it. The "N pieces on X" headline is now stacked over the picked topic's label and rides the orbit with it, instead of floating at a fixed height over the cloud where the picked label crossed it for part of every orbit (issue #297); the sweep's `knownOverlap` exception is gone.
