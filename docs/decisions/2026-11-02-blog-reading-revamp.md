# Classic site: blog reading revamp

- Date: 2026-11-02
- PR: [#392](https://github.com/ShinyQ/ShinyQ-HQ/pull/392)

The owner found blog posts hard to enjoy (text that felt wide, the phone navigation taking reading space). Decisions:
free stylesheet room first with CL-1 (#392: the lazy client UI's utilities moved into a second stylesheet that loads with
that UI: the Classic sheet went from about 20,419 to 15,294 B on Lighthouse, cap 20,480 B unchanged, client sheet
9,939 B, 3D JS unchanged); then a post reads on one centred measure shared by its title, meta and body, in the
brighter ink token, at the same 16 px (owner correction: no bigger text), with display-face section heads, framed code,
a calmer backdrop, a reading-time meta line, the tags and the two copy-link buttons moved to a compact row after the
post, "On this page" contents in the right gutter from 1280 px and a 2 px progress line. On every Classic page below
64rem the header hides on scroll down and shows on scroll up, and the floating Ask pill shrinks to its round icon while
reading down; reduced motion turns the slide into an instant show and hide and hides the progress line, and focus
inside the header always shows it.
