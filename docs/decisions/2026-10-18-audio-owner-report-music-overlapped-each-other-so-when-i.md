# Audio

- Date: 2026-10-18

Owner report: "the music is overlapped each other so when i visit L2, L3, L4, RF all is playing at the same time". Investigation (real Chromium and WebKit, Web Audio graph probe) showed the floor layers hand off correctly (one at a time); what overlapped was each floor layer playing on top of Deep Space Ambient. One soundtrack at a time: while Floor ambience is on and a floor is set, the floor layer replaces the music (2 s crossfade, the music stopped after it); switching the ambience off or leaving the floor brings the music back. `AMBIENCE_LEVEL` goes from 0.4 to 1 so a layer alone sits about 2 to 3 LU under the music it replaces. Supersedes "mixed under the music" in the Round 9 O row.
