import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token', details: userError?.message }, { status: 401 });
    }

    const body = await request.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const providerToken = userData?.user?.user_metadata?.google_drive_access_token;
    const refreshToken = userData?.user?.user_metadata?.google_drive_refresh_token;
    const tokenExpiry = userData?.user?.user_metadata?.google_drive_token_expiry;

    if (!providerToken) {
      return NextResponse.json({ 
        error: 'Google Drive not connected. Please connect your Google Drive first.',
        needsConnection: true
      }, { status: 403 });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
    let accessToken = providerToken as string;

    if (tokenExpiry && Date.now() >= tokenExpiry) {
      if (!refreshToken) {
        return NextResponse.json({ 
          error: 'Token expired and no refresh token available. Please reconnect Google Drive.',
          needsConnection: true
        }, { status: 403 });
      }
      try {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken as string
          })
        });
        if (!refreshRes.ok) throw new Error(await refreshRes.text());
        const refreshed = await refreshRes.json() as { access_token: string; expires_in?: number };
        accessToken = refreshed.access_token;
        const newExpiry = refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : undefined;
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...userData?.user?.user_metadata,
            google_drive_access_token: accessToken,
            ...(newExpiry ? { google_drive_token_expiry: newExpiry } : {})
          }
        });
      } catch (refreshError: any) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({ 
          error: 'Failed to refresh token. Please reconnect Google Drive.',
          needsConnection: true
        }, { status: 403 });
      }
    }

    const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!delRes.ok) {
      return NextResponse.json({ error: 'Failed to delete from Drive', details: await delRes.text() }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Drive delete error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete from Drive',
      details: error.message 
    }, { status: 500 });
  }
}

