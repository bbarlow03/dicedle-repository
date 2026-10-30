# Dicedle design restore points

## Classic raised mint design — October 29, 2026

Saved before the 8-bit arcade restyle at the owner's request.

- Git commit: `1bdfba2f29847041cefe7bfcfddc1819337b337d`.
- Full local snapshot: `.design-backups/classic-2026-10-29-1bdfba2.zip`.
- Snapshot SHA-256: `9F2FB78F0215039A316A99CC6A07EF8D8E39CE2674999C64B3B488980F738D1A`.
- Appearance: Space Grotesk and DM Mono, woven charcoal background, mint dice,
  rounded raised panels and buttons, mint/red roll glows, mint dice favicon.

To bring this design back, restore the classic head font links and remove the
`arcade.css` link from `index.html`. Restore its classic theme-color metadata and
the header's account SVG as well. Then restore `favicon.svg`, `favicon.ico`,
`icons/`, and `site.webmanifest` from this commit or snapshot. The underlying
`styles.css` is intentionally preserved by the arcade theme. Check later HTML
changes before replacing the entire file so newer features are not lost.

The snapshot is ignored by Git and stays outside the published website. The Git
commit is the durable reference if the local ZIP is no longer available.

## Active theme — peach pixel arcade

The owner updated the initial blue-dice reference to a peach background with
white/gray dice and dark outlines. `arcade.css`, the cube favicon, and
`assets/arcade/die-face-1.svg` through `die-face-6.svg` implement that newer reference.
The game dice tumble as cubes, then display one flat face with the result. The
earlier cube sprites remain in `assets/arcade/die-1.svg` through `die-6.svg`. Pixel fonts and
their licenses are kept in `assets/fonts/`. The centered layout, daily-run
rules, score history, and account logic are preserved.
