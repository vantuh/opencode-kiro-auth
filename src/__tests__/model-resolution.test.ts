import { Database } from 'bun:sqlite'
import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { KIRO_CONSTANTS, buildUrl } from '../constants.js'
import { resolveKiroModel } from '../plugin/models.js'

// Integration tests - prove model slugs are accepted by the AWS API.
// Requires valid auth token in kiro.db (skipped if not available).
describe('API model slug validation', () => {
  const KIRO_DB_PATH = process.env.KIRO_DB_PATH || `${process.env.HOME}/.config/opencode/kiro.db`
  let accessToken: string | null = null
  let region = 'us-east-1'

  beforeAll(() => {
    if (!existsSync(KIRO_DB_PATH)) return

    try {
      const db = new Database(KIRO_DB_PATH, { readonly: true })
      const row = db
        .prepare(
          `SELECT access_token, region FROM accounts
           WHERE is_healthy = 1
           ORDER BY expires_at DESC LIMIT 1`
        )
        .get() as any
      if (row?.access_token) {
        accessToken = row.access_token
        region = row.region || 'us-east-1'
      }
      db.close()
    } catch {
      // DB read failed, tests will be skipped
    }
  })

  async function apiRequest(
    modelId: string
  ): Promise<{ invalidModel: boolean; status: number; body: string }> {
    const url = buildUrl(KIRO_CONSTANTS.BASE_URL, region as any)
    const body = JSON.stringify({
      conversationState: {
        chatTriggerType: 'MANUAL',
        conversationId: `test-${Date.now()}`,
        currentMessage: {
          userInputMessage: {
            content: 'test',
            modelId,
            origin: 'AI_EDITOR'
          }
        }
      }
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-amzn-kiro-agent-mode': 'vibe',
        'amz-sdk-invocation-id': crypto.randomUUID(),
        'amz-sdk-request': 'attempt=1; max=1'
      },
      body
    })

    const text = await res.text().catch(() => '')
    return {
      invalidModel: text.includes('INVALID_MODEL_ID'),
      status: res.status,
      body: text.slice(0, 200)
    }
  }

  test('invalid model slug is rejected by API with INVALID_MODEL_ID', async () => {
    if (!accessToken) return

    const result = await apiRequest('this-model-does-not-exist')
    expect(result.invalidModel).toBe(true)
    expect(result.body).toContain('INVALID_MODEL_ID')
  })

  test('auto is accepted by API', async () => {
    if (!accessToken) return

    const result = await apiRequest(resolveKiroModel('auto'))
    expect(result.invalidModel).toBe(false)
  })

  test(
    'deepseek-3.2 is accepted by API',
    async () => {
      if (!accessToken) return

      const result = await apiRequest(resolveKiroModel('deepseek-3.2'))
      expect(result.invalidModel).toBe(false)
    },
    { timeout: 10000 }
  )

  test('claude-sonnet-4-5 is accepted by API', async () => {
    if (!accessToken) return

    const result = await apiRequest(resolveKiroModel('claude-sonnet-4-5'))
    expect(result.invalidModel).toBe(false)
  })

  test('qwen3-coder-480b (deleted) is rejected by API', async () => {
    if (!accessToken) return

    const result = await apiRequest('QWEN3_CODER_480B_A35B_1_0')
    expect(result.invalidModel).toBe(true)
  })
})
