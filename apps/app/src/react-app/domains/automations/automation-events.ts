export const automationsStateChangedEvent = "redrob:automations-state-changed"

export function dispatchAutomationsStateChanged() {
  window.dispatchEvent(new CustomEvent(automationsStateChangedEvent))
}
