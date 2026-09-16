// Lets a screen with unsaved edits (currently: Retention) block in-app
// navigation away from it without threading dirty-state through Sidebar's
// props. A screen registers a guard while it has unsaved changes; the shell
// checks it before switching screens.
let guard: (() => boolean) | null = null;

export function setLeaveGuard(fn: (() => boolean) | null) {
  guard = fn;
}

export function canLeaveCurrentScreen(): boolean {
  return guard ? guard() : true;
}
