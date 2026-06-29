// AI brainstorm — generates a set of short ideas for a topic and places each
// as a sticky note on the board, instead of only being able to talk about
// the board's content via chat.

export const BRAINSTORM_SYSTEM_PROMPT = `You are a brainstorming assistant. Given a topic, generate a list of short, distinct ideas related to it.
Return ONLY a JSON array of strings, no preamble, no explanation, no markdown code fences.
Each idea should be 2-8 words — short enough to read at a glance on a sticky note.
Generate between 5 and 12 ideas depending on how much the topic supports. Avoid near-duplicates.`

export function parseBrainstormIdeas(response: string): string[] {
  const stripped = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  const first = stripped.indexOf('[')
  const last = stripped.lastIndexOf(']')
  const jsonSlice = first !== -1 && last > first ? stripped.slice(first, last + 1) : stripped
  const parsed = JSON.parse(jsonSlice) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
    .slice(0, 12)
}

export async function generateBrainstormIdeas(topic: string): Promise<string[]> {
  const resp = await window.prose.ai.prompt({
    documentContent: topic,
    request: `${BRAINSTORM_SYSTEM_PROMPT}\n\nTopic: ${topic}`,
    fileType: 'board',
  })
  return parseBrainstormIdeas(resp)
}

// A small rotating palette so a batch of notes isn't visually monotone.
export const STICKY_NOTE_COLORS = ['#fff3a0', '#ffd6a5', '#caffbf', '#a0c4ff', '#ffadad', '#bdb2ff']
