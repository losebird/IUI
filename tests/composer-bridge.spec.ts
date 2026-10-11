import { afterEach, describe, expect, it } from 'vitest'
import {
  clearComposerDraftSetterForTests,
  findComposerEditable,
  insertIntoComposer,
  registerComposerDraftSetter,
  writeComposerEditable,
} from '../src/client/composer-bridge.ts'

afterEach(() => {
  clearComposerDraftSetterForTests()
  document.body.innerHTML = ''
})

describe('composer-bridge', () => {
  it('inserts via registered draft setter', async () => {
    let seen = ''
    registerComposerDraftSetter((text) => {
      seen = text
      return true
    })
    await expect(insertIntoComposer('hello fence')).resolves.toBe('inserted')
    expect(seen).toBe('hello fence')
  })

  it('falls back to DOM textarea when no setter', async () => {
    document.body.innerHTML = '<form><textarea data-composer placeholder="说点什么"></textarea></form>'
    const result = await insertIntoComposer('```iui\n{"items":[]}\n```')
    expect(result).toBe('inserted')
    const el = document.querySelector('textarea') as HTMLTextAreaElement
    expect(el.value).toContain('```iui')
  })

  it('findComposerEditable prefers visible composer selectors', () => {
    document.body.innerHTML = `
      <textarea style="display:none" placeholder="hidden"></textarea>
      <textarea data-composer placeholder="visible"></textarea>
    `
    const el = findComposerEditable()
    expect(el).not.toBeNull()
    expect((el as HTMLTextAreaElement).getAttribute('data-composer')).toBe('')
  })

  it('writeComposerEditable updates contenteditable', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    div.setAttribute('role', 'textbox')
    div.setAttribute('data-composer', '')
    document.body.appendChild(div)
    expect(writeComposerEditable(div, 'ping')).toBe(true)
    expect(div.textContent).toBe('ping')
  })

  it('returns failed for empty text', async () => {
    await expect(insertIntoComposer('   ')).resolves.toBe('failed')
  })
})
