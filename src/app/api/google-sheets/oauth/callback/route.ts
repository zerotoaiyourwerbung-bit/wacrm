import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * Google OAuth2 callback. Exchanges the authorization code for tokens
 * and stores them against the caller's account.
 *
 * Flow: the client opens
 *   https://accounts.google.com/o/oauth2/v2/auth?...redirect_uri=<this route>
 * in a popup/redirect; Google bounces back here with ?code=...; we
 * exchange + persist, then redirect to the automations builder.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const oauthError = url.searchParams.get('error')
  const state = url.searchParams.get('state')

  // Return the user to the page they connected from (e.g. the builder
  // at /automations/new) instead of always the list. `state` is the
  // path+query the client sent; accept only same-origin relative paths
  // to prevent open redirects. Anything else falls back to /automations.
  const safeReturn =
    typeof state === 'string' && state.startsWith('/') && !state.startsWith('//')
      ? state
      : '/automations'
  const redirectTarget = new URL(safeReturn, url.origin)

  if (oauthError || !code) {
    redirectTarget.searchParams.set('gsheets_error', oauthError ?? 'missing_code')
    return NextResponse.redirect(redirectTarget)
  }

  let accountId: string
  try {
    const ctx = await requireRole('admin')
    accountId = ctx.accountId
  } catch (err) {
    redirectTarget.searchParams.set('gsheets_error', 'unauthorized')
    return NextResponse.redirect(redirectTarget)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    redirectTarget.searchParams.set('gsheets_error', 'google_not_configured')
    return NextResponse.redirect(redirectTarget)
  }

  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${url.origin}/api/google-sheets/oauth/callback`

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => '')
      console.error('[gsheets-oauth] token exchange failed:', tokenRes.status, body.slice(0, 300))
      redirectTarget.searchParams.set('gsheets_error', 'token_exchange_failed')
      return NextResponse.redirect(redirectTarget)
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
      scope?: string
    }

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on the first consent. On a
      // re-auth without it, fall back to the stored refresh token if
      // one exists — a fresh access token alone is still useful. Only
      // hard-fail when there's nothing stored to fall back to.
      const db = supabaseAdmin()
      const { data: existing } = await db
        .from('google_oauth_tokens')
        .select('refresh_token')
        .eq('account_id', accountId)
        .maybeSingle()
      if (!existing?.refresh_token) {
        redirectTarget.searchParams.set('gsheets_error', 'no_refresh_token')
        return NextResponse.redirect(redirectTarget)
      }
      // Reuse the stored refresh token with the fresh access token.
      const { error: upsertErr } = await db.from('google_oauth_tokens').upsert({
        account_id: accountId,
        access_token: tokens.access_token,
        refresh_token: existing.refresh_token,
        token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      })
      if (upsertErr) {
        console.error('[gsheets-oauth] token persist failed:', upsertErr)
        redirectTarget.searchParams.set('gsheets_error', 'persist_failed')
        return NextResponse.redirect(redirectTarget)
      }
      redirectTarget.searchParams.set('gsheets_connected', '1')
      return NextResponse.redirect(redirectTarget)
    }

    const db = supabaseAdmin()
    const { error: upsertErr } = await db.from('google_oauth_tokens').upsert({
      account_id: accountId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    })
    if (upsertErr) {
      console.error('[gsheets-oauth] token persist failed:', upsertErr)
      redirectTarget.searchParams.set('gsheets_error', 'persist_failed')
      return NextResponse.redirect(redirectTarget)
    }

    redirectTarget.searchParams.set('gsheets_connected', '1')
    return NextResponse.redirect(redirectTarget)
  } catch (err) {
    console.error('[gsheets-oauth] callback crashed:', err)
    redirectTarget.searchParams.set('gsheets_error', 'unexpected')
    return NextResponse.redirect(redirectTarget)
  }
}
