/**
 * Ambient host surfaces used by the IUI settings page.
 * These exist on stock dsh web (ui-settings + loader) but are outside the
 * narrow slot/event unions shipped with the plugin's compile-time peers.
 */
import type { Context, Fiber } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(): void
  }

  interface Context {
    settings: {
      configure(presentation: { auto?: boolean }, owner?: Fiber): () => void
    }
    locale: {
      bind(ns: string): (key: string) => string
      register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void
    }
    configForms: {
      get(namespace: string): import('@deepseek-ai/dsh-client-ui-primitives').SettingsFormScope<unknown>
      whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.section': unknown
    'plugins.item': unknown
  }
}
