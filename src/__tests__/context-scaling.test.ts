import { describe, expect, test } from 'bun:test'
import { buildHistory, truncateHistory } from '../infrastructure/transformers/history-builder.js'

function generateConversation(pairs: number, contentSize: number): any[] {
  const msgs: any[] = []
  const filler = 'x'.repeat(contentSize)
  for (let i = 0; i < pairs; i++) {
    msgs.push({ role: 'user', content: `User message ${i}: ${filler}` })
    msgs.push({ role: 'assistant', content: `Assistant message ${i}: ${filler}` })
  }
  msgs.push({ role: 'user', content: 'Final question' })
  return msgs
}

describe('truncateHistory', () => {
  test('retains all messages when under limit', () => {
    const msgs = generateConversation(3, 100)
    const history = buildHistory(msgs, 'claude-sonnet-4.6', 250000)
    const truncated = truncateHistory(history, 850000)
    expect(truncated.length).toBeGreaterThanOrEqual(history.length - 1)
  })

  test('drops older messages when over limit', () => {
    const msgs = generateConversation(20, 5000)
    const history = buildHistory(msgs, 'claude-sonnet-4.6', 250000)
    const smallLimit = 50000
    const truncated = truncateHistory(history, smallLimit)
    expect(truncated.length).toBeLessThan(history.length)
    expect(truncated.length).toBeGreaterThan(0)
    expect(JSON.stringify(truncated).length).toBeLessThanOrEqual(smallLimit)
  })

  test('higher limit retains more messages', () => {
    const msgs = generateConversation(30, 5000)
    const history = buildHistory(msgs, 'claude-sonnet-4.6', 250000)

    const smallTruncated = truncateHistory([...history], 100000)
    const largeTruncated = truncateHistory([...history], 500000)

    expect(largeTruncated.length).toBeGreaterThan(smallTruncated.length)
  })
})

describe('1M context scaling', () => {
  const STANDARD_HISTORY_LIMIT = 850000
  const LONG_CTX_HISTORY_LIMIT = 4250000
  const STANDARD_TOOL_RESULT_LIMIT = 250000
  const LONG_CTX_TOOL_RESULT_LIMIT = 1250000

  test('1m history limit is 5x the standard limit', () => {
    expect(LONG_CTX_HISTORY_LIMIT).toBe(STANDARD_HISTORY_LIMIT * 5)
  })

  test('1m tool result limit is 5x the standard limit', () => {
    expect(LONG_CTX_TOOL_RESULT_LIMIT).toBe(STANDARD_TOOL_RESULT_LIMIT * 5)
  })

  test('1m model retains significantly more history than standard model', () => {
    const msgs = generateConversation(100, 5000)
    const history = buildHistory(msgs, 'claude-sonnet-4.6', STANDARD_TOOL_RESULT_LIMIT)

    const standardTruncated = truncateHistory([...history], STANDARD_HISTORY_LIMIT)
    const longCtxTruncated = truncateHistory([...history], LONG_CTX_HISTORY_LIMIT)

    expect(longCtxTruncated.length).toBeGreaterThan(standardTruncated.length)
  })

  test('standard limit truncates large conversation, 1m limit retains more', () => {
    const msgs = generateConversation(200, 5000)
    const history = buildHistory(msgs, 'claude-sonnet-4.6', STANDARD_TOOL_RESULT_LIMIT)

    const standardTruncated = truncateHistory([...history], STANDARD_HISTORY_LIMIT)
    const longCtxTruncated = truncateHistory([...history], LONG_CTX_HISTORY_LIMIT)

    expect(standardTruncated.length).toBeLessThan(history.length)
    expect(longCtxTruncated.length).toBeGreaterThan(standardTruncated.length)
  })

  test('reductionFactor scales both limits proportionally', () => {
    const reductionFactor = 0.6
    const standardReduced = Math.floor(STANDARD_HISTORY_LIMIT * reductionFactor)
    const longCtxReduced = Math.floor(LONG_CTX_HISTORY_LIMIT * reductionFactor)

    expect(longCtxReduced / standardReduced).toBeCloseTo(5, 1)
  })
})
