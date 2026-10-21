/**
 * G10 / S6: write one IUI config field from outside the settings form (「设为我的默认风格」,
 * 「保存为模板」, instant appearance / template edits). Kept apart from index.ts so the
 * settings section and the page frame can import it without a cycle.
 */
import type { SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'

let activeFormScope: SettingsFormScope<unknown> | null = null

export function setActiveIuiFormScope(scope: SettingsFormScope<unknown> | null): void {
  activeFormScope = scope
}

/** Resolves false when the host form is unavailable / read-only or rejects the write. */
export async function writeIuiConfigField(field: string, value: string): Promise<boolean> {
  const formScope = activeFormScope
  if (formScope === null) return false
  try {
    const snap = formScope.getSnapshot()
    if (snap.status !== 'ready' || !snap.writable) return false
    const op = value === ''
      ? { op: 'unset' as const, path: [field] }
      : { op: 'set' as const, path: [field], value }
    return await formScope.mutate([op], snap.revision)
  } catch {
    return false
  }
}
