/** Onboarding screens render no TitleBarFrame, so there is no
 * `-webkit-app-region: drag` anywhere on the page. Not only does that mean
 * the window can't be dragged, Electron's Window Controls Overlay only
 * activates its non-client hit-testing for the native minimize/maximize/close
 * buttons once some part of the page declares a drag region, so without this
 * those buttons silently stop responding too. Matches `.title-bar` from
 * globals.css; spans the full width like it does there. The native buttons
 * still take hit-test priority over the pixels underneath them. */
export function OnboardingDragRegion(): JSX.Element {
  return <div className="title-bar fixed inset-x-0 top-0 z-40 h-10" />
}
