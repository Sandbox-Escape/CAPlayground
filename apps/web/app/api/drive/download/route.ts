import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
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
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { fileId } = body as { fileId: string };

    if (!fileId) {
      return NextResponse.json({ error: 'File ID required' }, { status: 400 });
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

    let accessToken = providerToken;
    
    if (tokenExpiry && Date.now() >= tokenExpiry) {
      if (!refreshToken) {
        return NextResponse.json({ 
          error: 'Token expired. Please reconnect Google Drive.',
          needsConnection: true
        }, { status: 403 });
      }

      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      const { credentials } = await oauth2Client.refreshAccessToken();
      accessToken = credentials.access_token!;
      
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...userData?.user?.user_metadata,
          google_drive_access_token: accessToken,
          google_drive_token_expiry: credentials.expiry_date
        }
      });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const zipBuffer = Buffer.from(response.data as ArrayBuffer);
    const zipBase64 = zipBuffer.toString('base64');

    return NextResponse.json({ 
      success: true,
      zipData: zipBase64
    });

  } catch (error: any) {
    console.error('Drive download error:', error);
    return NextResponse.json({ 
      error: 'Failed to download from Drive',
      details: error.message 
    }, { status: 500 });
  }
}
