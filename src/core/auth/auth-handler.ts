import type { AuthHook } from '@opencode-ai/plugin'
import type { AccountRepository } from '../../infrastructure/database/account-repository.js'
import { RegionSchema } from '../../plugin/config/schema.js'
import * as logger from '../../plugin/logger.js'
import { IdcAuthMethod } from './idc-auth-method.js'

type ToastFunction = (message: string, variant: 'info' | 'warning' | 'success' | 'error') => void

export class AuthHandler {
  private accountManager?: any

  constructor(
    private config: any,
    private repository: AccountRepository
  ) {}

  async initialize(showToast?: ToastFunction): Promise<void> {
    const { syncFromKiroCli } = await import('../../plugin/sync/kiro-cli.js')

    logger.log('Auth init', { autoSyncKiroCli: !!this.config.auto_sync_kiro_cli })
    if (this.config.auto_sync_kiro_cli) {
      logger.log('Kiro CLI sync: start')
      await syncFromKiroCli()
      this.repository.invalidateCache()
      const accounts = await this.repository.findAll()
      if (this.accountManager) {
        for (const a of accounts) this.accountManager.addAccount(a)
      }
      logger.log('Kiro CLI sync: done', { importedAccounts: accounts.length })
    }

    this.logUsageSummary(showToast)
  }

  private logUsageSummary(showToast?: ToastFunction): void {
    if (!this.accountManager) return
    const accounts = this.accountManager.getAccounts()
    if (!accounts.length) return

    for (const acc of accounts) {
      const used = acc.usedCount ?? 0
      const limit = acc.limitCount ?? 0
      if (limit > 0) {
        const pct = Math.round((used / limit) * 100)
        const msg = `Kiro usage (${acc.email}): ${used}/${limit} (${pct}%)`
        logger.log(msg)
        if (showToast) {
          const variant = pct >= 90 ? 'warning' : 'info'
          setTimeout(() => showToast(msg, variant), 3000)
        }
      } else if (used > 0) {
        const msg = `Kiro usage (${acc.email}): ${used} requests used`
        logger.log(msg)
        if (showToast) setTimeout(() => showToast(msg, 'info'), 3000)
      }
    }
  }

  setAccountManager(am: any): void {
    this.accountManager = am
  }

  getMethods(): AuthHook['methods'] {
    if (!this.accountManager) {
      return []
    }

    const idcMethod = new IdcAuthMethod(this.config, this.repository, this.accountManager)

    return [
      {
        label: 'AWS Builder ID / IAM Identity Center',
        type: 'oauth' as const,
        prompts: [
          {
            type: 'text' as const,
            key: 'start_url',
            message: 'IAM Identity Center Start URL (leave blank for AWS Builder ID)',
            placeholder: 'https://your-company.awsapps.com/start',
            validate: (value: string) => {
              if (!value) return undefined
              try {
                new URL(value)
                return undefined
              } catch {
                return 'Please enter a valid URL'
              }
            }
          },
          {
            type: 'text' as const,
            key: 'idc_region',
            message: 'IAM Identity Center region (sso_region) (leave blank for us-east-1)',
            placeholder: 'us-east-1',
            validate: (value: string) => {
              if (!value) return undefined
              return RegionSchema.safeParse(value.trim()).success
                ? undefined
                : 'Please enter a valid AWS region'
            }
          }
        ],
        authorize: (inputs?: any) => idcMethod.authorize(inputs)
      }
    ]
  }
}
