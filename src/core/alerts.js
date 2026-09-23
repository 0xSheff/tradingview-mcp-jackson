/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a price alert on the chart's current symbol through the alert dialog.
 * Verified 2026-09-23 on TradingView Desktop: the dialog carries no stable
 * class or data-name, so the price field is found as the one visible input
 * holding a number; the value is set with the native setter + input/change +
 * blur (React commits it on blur, and the dialog's message line follows), and
 * the result is confirmed against the pricealerts list. The dialog defaults to
 * "Price · Crossing"; the default message ("<SYM> Crossing <price>") is kept —
 * the message editor is a sub-dialog.
 */
export async function create({ condition, price, message }) {
  const before = await list();
  const known = new Set((before.alerts || []).map((a) => a.alert_id));

  const opened = await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="set-alert-button"]')
        || document.querySelector('[aria-label="Create Alert"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
  if (!opened) {
    const client = await getClient();
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA' });
  }
  await sleep(1200);

  const priceSet = await evaluate(`
    (function() {
      var inp = Array.prototype.slice.call(document.querySelectorAll('input')).find(function(x) {
        return x.offsetParent !== null && /^[0-9,.]+$/.test(x.value || '');
      });
      if (!inp) return null;
      inp.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ${JSON.stringify(String(price))});
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.blur();
      inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return inp.value;
    })()
  `);
  if (!priceSet) {
    return { success: false, price, condition, price_set: false, error: 'alert dialog price field not found', source: 'dialog' };
  }
  await sleep(400);

  const clicked = await evaluate(`
    (function() {
      var b = Array.prototype.slice.call(document.querySelectorAll('button')).find(function(x) {
        return x.offsetParent !== null && (x.textContent || '').trim() === 'Create';
      });
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  await sleep(1200);

  const after = await list();
  const made = (after.alerts || []).find((a) => !known.has(a.alert_id));
  return {
    success: !!made,
    price,
    price_in_dialog: priceSet,
    condition: 'crossing',
    requested_condition: condition,
    alert_id: made?.alert_id ?? null,
    message: made?.message ?? null,
    requested_message: message || null,
    clicked_create: !!clicked,
    source: 'dialog',
  };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all }) {
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Individual alert deletion not yet supported. Use delete_all: true.');
}
