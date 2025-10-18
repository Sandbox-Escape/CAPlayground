import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    if (error) {
      return NextResponse.redirect(`${origin}/dashboard?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/dashboard?error=no_code`);
    }

    if (!state) {
      return NextResponse.redirect(`${origin}/dashboard?error=no_user_id`);
    }

    const redirectUri = `${origin}/api/drive/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri
      })
    });
    if (!tokenRes.ok) {
      const details = await tokenRes.text();
      return NextResponse.redirect(`${origin}/dashboard?error=${encodeURIComponent('token_exchange_failed')}&details=${encodeURIComponent(details)}`);
    }
    const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokens.access_token) {
      return NextResponse.redirect(`${origin}/dashboard?error=no_token`);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(state);
    
    if (userError || !userData?.user) {
      console.error('Failed to get user:', userError);
      return NextResponse.redirect(`${origin}/dashboard?error=user_not_found`);
    }

    const user = userData.user;

    const nowExpiry = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined;
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        google_drive_access_token: tokens.access_token,
        ...(tokens.refresh_token ? { google_drive_refresh_token: tokens.refresh_token } : {}),
        ...(nowExpiry ? { google_drive_token_expiry: nowExpiry } : {}),
        google_drive_connected_at: new Date().toISOString()
      }
    });

    if (updateError) {
      console.error('Failed to update user metadata:', updateError);
      return NextResponse.redirect(`${origin}/dashboard?error=update_failed`);
    }

    return NextResponse.redirect(`${origin}/dashboard?drive_connected=true`);

  } catch (error: any) {
    console.error('Drive callback error:', error);
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    return NextResponse.redirect(`${origin}/dashboard?error=${encodeURIComponent(error.message)}`);
  }
}
