import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      `${origin}/api/drive/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    
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

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        google_drive_access_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token,
        google_drive_token_expiry: tokens.expiry_date,
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
