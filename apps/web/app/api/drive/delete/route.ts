import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    
    let accessToken = providerToken;
    
    if (tokenExpiry && Date.now() >= tokenExpiry) {
      if (!refreshToken) {
        return NextResponse.json({ 
          error: 'Token expired and no refresh token available. Please reconnect Google Drive.',
          needsConnection: true
        }, { status: 403 });
      }

      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token!;
        
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...userData?.user?.user_metadata,
            google_drive_access_token: accessToken,
            google_drive_token_expiry: credentials.expiry_date
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

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    await drive.files.delete({
      fileId: fileId
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Drive delete error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete from Drive',
      details: error.message 
    }, { status: 500 });
  }
}
