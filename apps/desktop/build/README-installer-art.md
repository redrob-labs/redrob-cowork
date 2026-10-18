# Installer / uninstaller art (Windows NSIS)

The redesigned installer (uiux-refresh round 3, approved preview) uses two branded sidebar
images on the Welcome / Finish pages. electron-builder's NSIS target picks these up
automatically **by filename** when they sit in this `build/` directory:

| File (place in `apps/desktop/build/`) | Shown on | Size | Format |
|---|---|---|---|
| `installerSidebar.bmp`   | installer Welcome + Finish pages   | 164 x 314 px | 24-bit BMP (no alpha) |
| `uninstallerSidebar.bmp` | uninstaller Welcome + Finish pages | 164 x 314 px | 24-bit BMP (no alpha) |
| `installerHeader.bmp` (optional) | top strip of inner pages | 150 x 57 px | 24-bit BMP |

## What they should look like (matches the browser preview)

- A vertical **Redrob Blue** panel: radial gradient from `#2E7EFF` to `#2746EE` (Redrob Blue
  `#2B52FF` at the mid-stop), the exact brand wash.
- The **Redrob GROUP** mark (white group glyph) near the top, centered.
- A soft highlight/sheen (the preview uses two radial glints: white top-left, violet `#8B82FF`
  bottom-right) for depth.
- NSIS draws the page copy over the right side itself, so leave the lower area clean.

## How to produce them

Source art: `apps/app/public/brand/redrob-group.svg` (the group mark) on the gradient above.
Export at 164 x 314, then save as a **24-bit BMP** (NSIS does not read PNG/alpha for the sidebar).
A reduced-motion / accessibility concern does not apply - these are static images.

Until the BMPs are added, electron-builder falls back to its default sidebar, and the rest of the
redesign (warm copy, the install status metaphors, the uninstaller feedback page) already applies
from `installer.nsh`. The copy and flow were approved via the browser preview mockup; the bitmaps
are the one asset that must be exported by a human from the brand source.
