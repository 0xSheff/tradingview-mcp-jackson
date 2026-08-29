"""Generate scripts/chrisfx_levels.pine — the visual multi-timeframe indicator.

Like the stats indicator, it carries a mechanical COPY of the detection block
from chrisfx_strategy.pine, guarded by tests/chris_pine_shared.test.js. What you
see on the chart is then the same detection that produced the backtest numbers.
"""
import io

STRAT = r'c:\c_projects\tradingview-mcp-jackson\scripts\chrisfx_strategy.pine'
OUT = r'c:\c_projects\tradingview-mcp-jackson\scripts\chrisfx_levels.pine'

START = '// >>> SHARED DETECTION START'
END = '// <<< SHARED DETECTION END'

src = io.open(STRAT, encoding='utf-8').read()
block = src[src.index(START):src.index(END) + len(END)] + '\n'

HEAD = '''//@version=6
// ChrisFX Levels - the breaker zones, drawn, from up to three timeframes.
//
// A viewing tool, not a measurement one. It runs the SAME detection as
// scripts/chrisfx_stats.pine (the block below is copied mechanically and a test
// fails if the two drift), so what is drawn here is what was measured in
// docs/CHRISFX_BACKTEST_02.md.
//
// Per timeframe it draws: the breaker zone extended right, its grade, the
// liquidity level the move swept, and the FVG that validated it. Grades and
// timeframes are filterable so it can sit under another method without noise.

indicator("ChrisFX Levels", overlay = true, max_boxes_count = 500,
     max_labels_count = 500, max_lines_count = 500, max_bars_back = 1000)

// --- Detection inputs (mirror rules.json -> chris) ----------------------------
gDet          = "Detection"
liqLookback   = input.int(60,   "Liquidity lookback (bars)",      minval = 5, maxval = 100, group = gDet)
legLookback   = input.int(10,   "Leg window for characteristic 2", minval = 2, maxval = 50,  group = gDet)
fvgSearch     = input.int(5,    "FVG search after grab (bars)",   minval = 1, maxval = 20,  group = gDet)
fvgRequired   = input.bool(true,"Require an FVG over the zone",   group = gDet)
atrLen        = input.int(14,   "ATR length",                     minval = 2, group = gDet)
atrMult       = input.float(1.3,"Impulse: body >= ATR x",         minval = 0, step = 0.1, group = gDet)
bodyRatioMin  = input.float(0.6,"Impulse: body / range >=",       minval = 0, maxval = 1, step = 0.05, group = gDet)
instantMax    = input.int(3,    "Reversal is instant within (bars)", minval = 1, group = gDet)
freshMax      = input.int(12,   "A vs B: level age <= (bars)",    minval = 1, group = gDet)

// --- Timeframes --------------------------------------------------------------
gTF  = "Timeframes"
t1On = input.bool(true,  "", inline = "t1", group = gTF)
t1   = input.timeframe("15", "TF 1", inline = "t1", group = gTF)
t1c  = input.color(color.new(#2962FF, 0), "", inline = "t1", group = gTF)
t2On = input.bool(true,  "", inline = "t2", group = gTF)
t2   = input.timeframe("60", "TF 2", inline = "t2", group = gTF)
t2c  = input.color(color.new(#FF6D00, 0), "", inline = "t2", group = gTF)
t3On = input.bool(false, "", inline = "t3", group = gTF)
t3   = input.timeframe("240", "TF 3", inline = "t3", group = gTF)
t3c  = input.color(color.new(#00897B, 0), "", inline = "t3", group = gTF)

// --- What to draw ------------------------------------------------------------
gDraw      = "Display"
showApp    = input.bool(true, "A++", inline = "g", group = gDraw)
showAp     = input.bool(true, "A+",  inline = "g", group = gDraw)
showA      = input.bool(true, "A",   inline = "g", group = gDraw)
showB      = input.bool(true, "B",   inline = "g", group = gDraw)
extendBars = input.int(60,  "Extend zones right (bars)", minval = 5, maxval = 500, group = gDraw)
keepPerTf  = input.int(6,   "Keep the last N zones per timeframe", minval = 1, maxval = 40, group = gDraw)
showLiq    = input.bool(true,  "Draw the swept liquidity level", group = gDraw)
showLabel  = input.bool(true,  "Label with timeframe and grade", group = gDraw)
zoneOpacity= input.int(85, "Zone fill transparency", minval = 0, maxval = 100, group = gDraw)

// grade filters used by the shared block; every grade is detected, the display
// filter is applied when drawing
tradeApp = true
tradeAp  = true
tradeA   = true
tradeB   = true

EVAL_OFFSET = fvgSearch + 1

'''

TAIL = '''
// --- Drawing -----------------------------------------------------------------
gradeShown(int g) => g == 0 ? showApp : g == 1 ? showAp : g == 2 ? showA : g == 3 ? showB : false

var array<box>   drawn  = array.new<box>()
var array<label> tags   = array.new<label>()
var array<line>  liqs   = array.new<line>()
var array<int>   slotOf = array.new_int()

// One "last drawn" memory per timeframe slot and direction, so a zone is drawn
// once when it appears rather than on every bar it remains valid.
var array<float> lastHi = array.new_float(6, na)
var array<float> lastLo = array.new_float(6, na)

trimSlot(int slot) =>
    int seen = 0
    if array.size(slotOf) > 0
        for i = array.size(slotOf) - 1 to 0
            if array.get(slotOf, i) == slot
                seen += 1
                if seen > keepPerTf
                    box.delete(array.get(drawn, i))
                    label.delete(array.get(tags, i))
                    line.delete(array.get(liqs, i))
                    array.remove(drawn,  i)
                    array.remove(tags,   i)
                    array.remove(liqs,   i)
                    array.remove(slotOf, i)

emit(int slot, string tfName, color c, int g, float zh, float zl, float lvl, bool isLong) =>
    if not na(zh) and not na(zl) and zh > zl and gradeShown(g)
        int key = slot * 2 + (isLong ? 0 : 1)
        bool fresh = na(array.get(lastHi, key)) or array.get(lastHi, key) != zh or array.get(lastLo, key) != zl
        if fresh
            array.set(lastHi, key, zh)
            array.set(lastLo, key, zl)
            box b = box.new(bar_index, zh, bar_index + extendBars, zl,
                 border_color = c, border_width = 1, bgcolor = color.new(c, zoneOpacity))
            label l = showLabel
                 ? label.new(bar_index + extendBars, isLong ? zl : zh,
                      tfName + " " + gradeName(g) + (isLong ? " long" : " short"),
                      style = isLong ? label.style_label_up : label.style_label_down,
                      color = color.new(c, 20), textcolor = color.white, size = size.tiny)
                 : label.new(na, na, "", style = label.style_none)
            line ln = showLiq and not na(lvl)
                 ? line.new(bar_index - EVAL_OFFSET, lvl, bar_index + extendBars, lvl,
                      color = color.new(c, 30), style = line.style_dotted, width = 1)
                 : line.new(na, na, na, na, style = line.style_dotted)
            array.push(drawn,  b)
            array.push(tags,   l)
            array.push(liqs,   ln)
            array.push(slotOf, slot)
            trimSlot(slot)

// Each slot is read on its own timeframe. Two calls per slot, one per direction.
[g1l, l1l, h1l, o1l, i1l, b1l] = request.security(syminfo.tickerid, t1, detectSetup(EVAL_OFFSET, true),  lookahead = barmerge.lookahead_off)
[g1s, l1s, h1s, o1s, i1s, b1s] = request.security(syminfo.tickerid, t1, detectSetup(EVAL_OFFSET, false), lookahead = barmerge.lookahead_off)
[g2l, l2l, h2l, o2l, i2l, b2l] = request.security(syminfo.tickerid, t2, detectSetup(EVAL_OFFSET, true),  lookahead = barmerge.lookahead_off)
[g2s, l2s, h2s, o2s, i2s, b2s] = request.security(syminfo.tickerid, t2, detectSetup(EVAL_OFFSET, false), lookahead = barmerge.lookahead_off)
[g3l, l3l, h3l, o3l, i3l, b3l] = request.security(syminfo.tickerid, t3, detectSetup(EVAL_OFFSET, true),  lookahead = barmerge.lookahead_off)
[g3s, l3s, h3s, o3s, i3s, b3s] = request.security(syminfo.tickerid, t3, detectSetup(EVAL_OFFSET, false), lookahead = barmerge.lookahead_off)

if barstate.isconfirmed
    if t1On
        if g1l >= 0
            emit(0, t1, t1c, g1l, h1l, o1l, l1l, true)
        if g1s >= 0
            emit(0, t1, t1c, g1s, h1s, o1s, l1s, false)
    if t2On
        if g2l >= 0
            emit(1, t2, t2c, g2l, h2l, o2l, l2l, true)
        if g2s >= 0
            emit(1, t2, t2c, g2s, h2s, o2s, l2s, false)
    if t3On
        if g3l >= 0
            emit(2, t3, t3c, g3l, h3l, o3l, l3l, true)
        if g3s >= 0
            emit(2, t3, t3c, g3s, h3s, o3s, l3s, false)
'''

out = HEAD + block + TAIL
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('levels indicator written, lines:', out.count(chr(10)))
