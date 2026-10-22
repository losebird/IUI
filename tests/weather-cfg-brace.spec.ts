import { describe, expect, it } from 'vitest'
import { prepareAuthorJs, softCloseObjectBeforeCallParen, softCloseObjectBeforeSemicolon } from '../src/shared/html-sandbox.ts'

/** Minimised Suzhou weather drawChart: options closed, cfg object not. */
const SUZHOU_CFG_MISSING_BRACE = `
(function(){
function drawChart(){
var cfg={type:'line',data:{labels:['08'],datasets:[{data:[18]}]},options:{responsive:true,scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666'}},y1:{position:'right',title:{text:'%'}}}};
if(typeof Chart!=='undefined') new Chart(document.getElementById('hourly'),cfg);
}
drawChart();
})();
`

describe('Suzhou weather: missing cfg } before semicolon', () => {
  it('raw author JS throws Unexpected token ;', () => {
    expect(() => new Function(SUZHOU_CFG_MISSING_BRACE)).toThrow(/Unexpected token/)
  })

  it('softCloseObjectBeforeSemicolon inserts } and then parses', () => {
    const out = softCloseObjectBeforeSemicolon(SUZHOU_CFG_MISSING_BRACE)
    expect(out).not.toBe(SUZHOU_CFG_MISSING_BRACE)
    expect(() => new Function(out)).not.toThrow()
    expect(out).toMatch(/title:\{text:'%'}}}}}/)
  })

  it('prepareAuthorJs heals the same Chart cfg hole', () => {
    const out = prepareAuthorJs(SUZHOU_CFG_MISSING_BRACE)
    expect(() => new Function(out)).not.toThrow()
  })

  it('does not rewrite a balanced IIFE', () => {
    const ok = '(function(){ var cfg={a:1}; return cfg; })();'
    expect(softCloseObjectBeforeSemicolon(ok)).toBe(ok)
    expect(prepareAuthorJs(ok)).toContain('var cfg={a:1}')
  })

  /** Real Suzhou page: function bodies have `;` long before `var cfg=`. */
  it('does not insert } at the first function-body semicolon', () => {
    const src = `(function(){
function wx(c){c=Number(c);return c;}
function drawChart(){
var cfg={type:'line',data:{labels:['08'],datasets:[{data:[18]}]},options:{responsive:true,scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666'}},y1:{position:'right',title:{text:'%'}}}};
if(typeof Chart!=='undefined') new Chart(document.getElementById('hourly'),cfg);
}
drawChart();
})();`
    expect(() => new Function(src)).toThrow(/Unexpected token/)
    const out = prepareAuthorJs(src)
    expect(out).not.toMatch(/function wx\(c\)\{c=Number\(c\)\}+;/)
    expect(() => new Function(out)).not.toThrow()
    expect(out).toMatch(/title:\{text:'%'}}}}}/)
  })
})

/** CMA page: makeChart({…options}) closed the object with `)` instead of `}`. */
const CMA_DRAW_DAILY_BAD = `(function(){
function makeChart(cfg){ window.__cfg = cfg; }
function drawHourly(){
makeChart({type:'line',data:{labels:['08'],datasets:[{data:[18]}]},options:{responsive:true,plugins:{legend:{display:true}},scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666'},title:{display:true,text:'°C'}}}}});
}
function drawDaily(){
makeChart({type:'line',data:{labels:['今'],datasets:[{data:[18]}]},options:{responsive:true,plugins:{legend:{display:true},title:{display:true,text:'hi'}},scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666'},title:{display:true,text:'°C'}}}});
}
drawHourly();
drawDaily();
})();`

describe('CMA weather: object closed with ) instead of }', () => {
  it('raw drawDaily throws Unexpected token )', () => {
    expect(() => new Function(CMA_DRAW_DAILY_BAD)).toThrow(/Unexpected token/)
  })

  it('inserts } before the stray ) and then parses', () => {
    const out = softCloseObjectBeforeCallParen(CMA_DRAW_DAILY_BAD)
    expect(out).not.toBe(CMA_DRAW_DAILY_BAD)
    expect(() => new Function(out)).not.toThrow()
    expect(out).toContain("text:'°C'}}}}});")
  })

  it('prepareAuthorJs heals the same makeChart hole', () => {
    const out = prepareAuthorJs(CMA_DRAW_DAILY_BAD)
    expect(() => new Function(out)).not.toThrow()
  })

  it('does not rewrite a balanced makeChart call', () => {
    const ok = `(function(){ makeChart({type:'line',data:{a:1},options:{scales:{x:1,y:2}}}); function makeChart(){} })();`
    expect(softCloseObjectBeforeCallParen(ok)).toBe(ok)
  })

  it('heals makeChart inside a real IIFE (not fooled by function(){)', () => {
    const src = `(function(){
function makeChart(cfg){ window.__cfg = cfg; }
makeChart({type:'line',data:{labels:['今'],datasets:[{data:[18]}]},options:{responsive:true,plugins:{legend:{display:true},title:{display:true,text:'hi'}},scales:{x:{ticks:{color:'#666'}},y:{ticks:{color:'#666'},title:{display:true,text:'°C'}}}});
})();`
    expect(() => new Function(src)).toThrow(/Unexpected token/)
    const out = prepareAuthorJs(src)
    expect(() => new Function(out)).not.toThrow()
  })

  it('heals two missing } in one IIFE (drawDaily + drawHourly)', () => {
    const src = `(function(){
function makeChart(cfg){ window.__cfg = cfg; }
function drawDaily(){
makeChart({type:'line',data:{labels:['今'],datasets:[{data:[18]}]},options:{plugins:{legend:{display:true}},scales:{x:{ticks:{color:'#666'}},y:{title:{text:'°C'}}}});
}
function drawHourly(){
makeChart({type:'line',data:{labels:['08'],datasets:[{data:[18]}]},options:{plugins:{legend:{display:true}},scales:{x:{ticks:{color:'#666'}},y:{title:{text:'°C'}}}});
}
drawDaily();
drawHourly();
})();`
    expect(() => new Function(src)).toThrow(/Unexpected token/)
    const out = prepareAuthorJs(src)
    expect(() => new Function(out)).not.toThrow()
  })
})
