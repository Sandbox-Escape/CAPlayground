import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const runtime = 'edge';

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const providerToken = userData?.user?.user_metadata?.google_drive_access_token;
    const refreshToken = userData?.user?.user_metadata?.google_drive_refresh_token;
    const tokenExpiry = userData?.user?.user_metadata?.google_drive_token_expiry;

    if (!providerToken) {
      return NextResponse.json({ 
        error: 'Google Drive not connected',
        needsConnection: true
      }, { status: 403 });
    }

    let accessToken = providerToken as string;

    if (tokenExpiry && Date.now() >= tokenExpiry) {
      if (!refreshToken) {
        return NextResponse.json({ 
          error: 'Token expired. Please reconnect Google Drive.',
          needsConnection: true
        }, { status: 403 });
      }

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
      if (!refreshRes.ok) return NextResponse.json({ error: 'Failed to refresh token', needsConnection: true }, { status: 403 });
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
    }

    const listFiles = async (q: string, fields: string, extra: Record<string,string> = {}) => {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', q);
      url.searchParams.set('fields', fields);
      url.searchParams.set('spaces', 'drive');
      for (const [k,v] of Object.entries(extra)) url.searchParams.set(k, v);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    };

    const folderQuery = await listFiles(
      "name='CAPlayground' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      'files(id, name)'
    );

    if (!folderQuery.files || folderQuery.files.length === 0) {
      return NextResponse.json({ files: [] });
    }

    const folderId = folderQuery.files[0].id as string;

    const filesQuery = await listFiles(
      `'${folderId}' in parents and trashed=false and mimeType='application/zip'`,
      'files(id, name, webViewLink, createdTime, size)',
      { orderBy: 'createdTime desc' }
    );

    return NextResponse.json({ 
      files: filesQuery.files || []
    });

  } catch (error: any) {
    console.error('Drive list error:', error);
    return NextResponse.json({ 
      error: 'Failed to list Drive files',
      details: error.message 
    }, { status: 500 });
  }
}
