const express = require('express');
const { getSupabase, isSupabaseConfigured } = require('../../db/supabaseClient');
const exchangeService = require('../../services/exchangeService');

const router = express.Router();

function sessionId(req) {
  return String(req.headers['x-watchlist-session'] || req.body?.sessionId || '').trim().slice(0, 64);
}

router.get('/', async (req, res) => {
  try {
    const sid = sessionId(req);
    if (!sid || !isSupabaseConfigured()) {
      return res.json({ sessionId: sid || null, items: [] });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('watchlists')
      .select('id, name, created_at, watchlist_items(id, exchange_code, symbol, added_at)')
      .eq('session_id', sid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({
      sessionId: sid,
      watchlist: data || null,
      items: data?.watchlist_items || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items', async (req, res) => {
  try {
    const sid = sessionId(req);
    const exchange = exchangeService.normalizeExchangeCode(req.body?.exchange);
    const symbol = String(req.body?.symbol || '').toUpperCase().trim();
    if (!sid || !symbol) {
      return res.status(400).json({ error: 'sessionId and symbol required' });
    }
    if (!isSupabaseConfigured()) {
      return res.json({ ok: true, localOnly: true, exchange, symbol });
    }

    const supabase = getSupabase();
    let { data: wl } = await supabase
      .from('watchlists')
      .select('id')
      .eq('session_id', sid)
      .maybeSingle();

    if (!wl) {
      const { data: created, error: createErr } = await supabase
        .from('watchlists')
        .insert({ session_id: sid, name: 'My Watchlist' })
        .select('id')
        .single();
      if (createErr) throw createErr;
      wl = created;
    }

    const { data, error } = await supabase
      .from('watchlist_items')
      .upsert(
        { watchlist_id: wl.id, exchange_code: exchange, symbol },
        { onConflict: 'watchlist_id,exchange_code,symbol' }
      )
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/items/:exchange/:symbol', async (req, res) => {
  try {
    const sid = sessionId(req);
    const exchange = exchangeService.normalizeExchangeCode(req.params.exchange);
    const symbol = String(req.params.symbol || '').toUpperCase();
    if (!sid || !isSupabaseConfigured()) {
      return res.json({ ok: true, localOnly: true });
    }

    const supabase = getSupabase();
    const { data: wl } = await supabase.from('watchlists').select('id').eq('session_id', sid).maybeSingle();
    if (!wl) return res.json({ ok: true });

    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('watchlist_id', wl.id)
      .eq('exchange_code', exchange)
      .eq('symbol', symbol);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
