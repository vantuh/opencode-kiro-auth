import type { ToolCall } from '../../plugin/types'

function findJsonEnd(text: string, start: number): number {
  let braceCount = 0
  let inString = false
  let escapeNext = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === '\\') {
      escapeNext = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (!inString) {
      if (char === '{') braceCount++
      else if (char === '}') {
        braceCount--
        if (braceCount === 0) return i
      }
    }
  }
  return -1
}

const BRACKET_PATTERN = /\[Called\s+([\w-]+)\s+with\s+args:\s*/g

export function parseBracketToolCalls(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  const removals: Array<{ start: number; end: number }> = []

  BRACKET_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null = BRACKET_PATTERN.exec(text)
  while (match !== null) {
    const name = match[1]
    const jsonStart = match.index + match[0].length

    const braceIdx = text.indexOf('{', jsonStart)
    if (braceIdx >= 0 && braceIdx === jsonStart) {
      const jsonEndIdx = findJsonEnd(text, braceIdx)
      if (jsonEndIdx >= 0) {
        const afterJson = text.indexOf(']', jsonEndIdx + 1)
        if (afterJson >= 0 && text.substring(jsonEndIdx + 1, afterJson).trim().length === 0) {
          const jsonStr = text.substring(braceIdx, jsonEndIdx + 1)
          try {
            const args = JSON.parse(jsonStr)
            toolCalls.push({
              toolUseId: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: name!,
              input: args
            })
            removals.push({ start: match.index, end: afterJson + 1 })
          } catch {
            // Malformed JSON — skip
          }
        }
      }
    }
    match = BRACKET_PATTERN.exec(text)
  }

  return toolCalls
}

export function deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>()
  const unique: ToolCall[] = []

  for (const tc of toolCalls) {
    if (!seen.has(tc.toolUseId)) {
      seen.add(tc.toolUseId)
      unique.push(tc)
    }
  }

  return unique
}

export function cleanToolCallsFromText(text: string, toolCalls: ToolCall[]): string {
  const removals: Array<{ start: number; end: number }> = []

  for (const tc of toolCalls) {
    const escapedName = tc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\[Called\\s+${escapedName}\\s+with\\s+args:\\s*`, 'g')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      const braceIdx = text.indexOf('{', m.index + m[0].length)
      if (braceIdx < 0) continue
      const jsonEndIdx = findJsonEnd(text, braceIdx)
      if (jsonEndIdx < 0) continue
      const afterJson = text.indexOf(']', jsonEndIdx + 1)
      if (afterJson >= 0 && text.substring(jsonEndIdx + 1, afterJson).trim().length === 0) {
        removals.push({ start: m.index, end: afterJson + 1 })
      }
    }
  }

  let cleaned = text
  for (let i = removals.length - 1; i >= 0; i--) {
    cleaned = cleaned.substring(0, removals[i]!.start) + cleaned.substring(removals[i]!.end)
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}
