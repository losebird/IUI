import { describe, expect, it } from 'vitest'
import {
  buildHtmlSandboxSrcdoc,
  buildSandboxBridgeScript,
  sanitizeSandboxMarkup,
} from '../src/shared/html-sandbox.ts'

describe('0.13.0-iui.21 chart ready + safe handlers', () => {
  it('converts simple onclick to data-iui-on-click and still strips alert(1)', () => {
    const clean = sanitizeSandboxMarkup(
      '<button onclick="addSub()">+</button><button onclick="resetDemo(event)">reset</button><div onclick="alert(1)"></div>',
    )
    expect(clean).toContain('data-iui-on-click="addSub"')
    expect(clean).toContain('data-iui-on-click="resetDemo"')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('alert(1)')
  })

  it('runAuthorJs bridge waits for Chart and replays DOMContentLoaded', () => {
    const bridge = buildSandboxBridgeScript('t21')
    expect(bridge).toContain('wantsChart')
    expect(bridge).toContain('chart.umd.min.js')
    expect(bridge).toContain('DOMContentLoaded')
    expect(bridge).toContain('data-iui-on-click')
    expect(bridge).toContain('invokeDataHandler')
  })

  it('injects Chart CDN for canvas chart chrome even when js deferred', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'billing',
      height: 400,
      css: '.box{height:220px}',
      html: '<canvas id="shareChart"></canvas><canvas id="monthChart"></canvas><button data-iui-on-click="addSub">+</button>',
      js: '',
      stages: ['html'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: false,
    }, { deferAuthorJs: true, frameId: 't21' })
    expect(doc).toContain('chart.umd.min.js')
  })

  it('final path still replays DOMContentLoaded for author JS', () => {
    const doc = buildHtmlSandboxSrcdoc({
      title: 'billing',
      height: 400,
      css: '',
      html: '<canvas id="pieChart"></canvas><button id="add">+</button>',
      js: `document.addEventListener('DOMContentLoaded', function () {
  var ctx = document.getElementById('pieChart');
  new Chart(ctx, { type: 'doughnut', data: { labels: ['a'], datasets: [{ data: [1] }] } });
  document.getElementById('add').onclick = function () {};
});`,
      stages: ['html', 'js'],
      partial: false,
      cssComplete: true,
      htmlComplete: true,
      jsComplete: true,
    }, { deferAuthorJs: false, frameId: 't21f' })
    expect(doc).toContain('chart.umd.min.js')
    expect(doc).toContain('DOMContentLoaded')
  })
})
