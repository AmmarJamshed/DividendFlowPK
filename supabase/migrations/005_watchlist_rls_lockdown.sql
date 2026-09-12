-- Lock down watchlists: remove open anon policies.
-- Access is via backend service_role only (bypasses RLS).
-- Frontend never queries these tables with the anon key.

DROP POLICY IF EXISTS watchlists_service ON public.watchlists;
DROP POLICY IF EXISTS watchlist_items_service ON public.watchlist_items;

-- Authenticated users may only touch rows they own (user_id = auth.uid()).
-- Anonymous browser sessions continue to use the Express /v1/watchlist API
-- (service role), not PostgREST.

CREATE POLICY watchlists_select_own ON public.watchlists
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY watchlists_insert_own ON public.watchlists
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY watchlists_update_own ON public.watchlists
  FOR UPDATE
  TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY watchlists_delete_own ON public.watchlists
  FOR DELETE
  TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY watchlist_items_select_own ON public.watchlist_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id IS NOT NULL
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY watchlist_items_insert_own ON public.watchlist_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id IS NOT NULL
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY watchlist_items_update_own ON public.watchlist_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id IS NOT NULL
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id IS NOT NULL
        AND w.user_id = auth.uid()
    )
  );

CREATE POLICY watchlist_items_delete_own ON public.watchlist_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id IS NOT NULL
        AND w.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.watchlists FROM anon;
REVOKE ALL ON public.watchlist_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_items TO authenticated;
