import type { GenuiSpec } from '../spec.ts'

/** 设置 → IUI 实时预览用的紧凑规格（中文默认）。 */
export const SETTINGS_PREVIEW_SPEC: GenuiSpec = {
  title: '预览',
  gap: 12,
  items: [
    {
      type: 'row',
      items: [
        { type: 'stat', label: 'CPU', value: '34%', delta: '+2%', spark: [12, 18, 22, 28, 31, 34] },
        { type: 'stat', label: '内存', value: '8.2 GiB', delta: '-0.4' },
      ],
    },
    { type: 'progress', label: '磁盘', value: 62, valueLabel: '62%' },
    {
      type: 'card',
      title: '快捷操作',
      items: [
        { type: 'input', id: 'preview-name', label: '姓名', placeholder: 'Ace' },
        {
          type: 'row',
          items: [
            { type: 'button', label: '主按钮', action: 'noop' },
            { type: 'button', label: '次要', tone: 'ghost', action: 'noop' },
          ],
        },
      ],
    },
  ],
}
