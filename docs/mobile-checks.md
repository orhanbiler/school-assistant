# Mobile verification

## September 7 settings update

Below the 1024-pixel desktop breakpoint, a settings button opens a bottom panel with Light, Dark, and System appearance choices, sign-out, and a separate device-data section. Clearing data still requires confirmation. The panel scrolls on short screens and accounts for the bottom safe area. The header keeps one model picker and one installation control mounted across breakpoints.

ESLint, TypeScript, the 66-test suite, and the Webpack production build passed. This update has not had a fresh viewport or physical-device check because no browser was connected. Follow-up checks should cover 320-pixel widths, landscape scrolling, theme selection, closing the panel, and canceling the clear-data confirmation without losing the settings panel.

## Previous browser verification

Checked on September 6, 2026 in a Chromium browser using viewport emulation. These checks do not substitute for testing a physical iPhone or Android device.

## Layout and interaction

- Checked widths of 320, 390, 768, 1024, and 1440 pixels. The workspace fitted the page without horizontal overflow. Writing-format labels stayed visible.
- Verified the production build at 320 × 640 and 390 × 844. Phone buttons were at least 44 pixels high; primary controls use 48-pixel targets.
- A seven-column draft table scrolled within its own boundary with readable column widths. Long reference URLs wrapped without widening the page.
- At 320 × 640, a 116-page PDF opened in a 288 × 608 dialog. Page selection and the fixed action area stayed within the viewport. Choosing a short page range enabled adding the selected text.
- Checked the installation instructions, model picker, discussion follow-up layout, sign-out, and sign-in at the narrowest size.
- Rechecked the redesigned section navigation at 320 × 640 in light mode and 390 × 844 in dark mode. All three labels fit within 48-pixel-high links. The selected section updates as the page scrolls, destinations sit below the sticky control, and the navigation is hidden at the desktop breakpoint. Rounded styling, icons, and a tinted selected state replace the original full-width text bar.
- Verified notes-only generation, manual draft editing, reload persistence, AI light editing, and restoring the previous draft with a synthetic provider. No live model or detector score was evaluated during these checks.

## Device features

The layout accounts for safe-area insets, dynamic viewport height, reduced motion, and larger input text. Reading a draft uses normal page scrolling on phones. Pinch zoom remains enabled.

The web app manifest and icons support home-screen installation. Browsers that expose an installation prompt receive an install action; other browsers see instructions. Native sharing appears only when the browser exposes the Web Share API. Native installation, share sheets, and software-keyboard behavior still need physical-device checks.

No service worker or offline cache was added. Private pages retain their existing no-store policy, and generation retains owner authentication, request limits, and usage caps.
