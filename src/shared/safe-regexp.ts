/**
 * Safe RegExp construction for parent-page classifiers.
 * Prevents "Invalid regular expression flags" / bad patterns from crashing the host.
 */
export function safeRegExp(source: string, flags: string): RegExp | null {
  try {
    const cleaned = flags.replace(/[^gimsuy]/gi, '')
    return new RegExp(source, cleaned)
  } catch {
    return null
  }
}

export function safeRegExpTest(source: string, flags: string, text: string): boolean {
  const re = safeRegExp(source, flags)
  if (!re) return false
  try {
    return re.test(text)
  } catch {
    return false
  }
}
