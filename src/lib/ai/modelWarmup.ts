// Shared helper for the "Starting AI model…" step shown by interactive
// loading UIs (Slides Generate, Documents Issues analysis) before their
// existing cosmetic phases. Ollama's /api/ps lists models currently resident
// in memory — a model missing from that list will incur a real cold-load
// delay on its next request, so this is a concrete signal, not a guess.
export async function waitForModelWarm(maxWaitMs = 60_000, pollMs = 800): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      if (await window.prose.ai.isModelLoaded()) return
    } catch {
      return // can't tell — don't block the caller on a broken check
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}
