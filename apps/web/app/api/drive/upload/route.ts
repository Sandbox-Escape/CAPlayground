import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { Readable } from 'stream';

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
    const { projects } = body as { projects: Array<{ id: string; name: string; zipData: string }> };

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return NextResponse.json({ error: 'No projects specified' }, { status: 400 });
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

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let folderId: string;
    const folderQuery = await drive.files.list({
      q: "name='CAPlayground' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (folderQuery.data.files && folderQuery.data.files.length > 0) {
      folderId = folderQuery.data.files[0].id!;
    } else {
      const folderMetadata = {
        name: 'CAPlayground',
        mimeType: 'application/vnd.google-apps.folder'
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id'
      });
      folderId = folder.data.id!;
    }

    const results = [];
    for (const project of projects) {
      try {
        const zipBuffer = Buffer.from(project.zipData, 'base64');
        const bufferStream = Readable.from(zipBuffer);
        
        const searchResponse = await drive.files.list({
          q: `name='${project.name}.ca.zip' and '${folderId}' in parents and trashed=false`,
          fields: 'files(id, name, modifiedTime)',
          spaces: 'drive'
        });

        let uploadResponse;
        let existingFileId = searchResponse.data.files && searchResponse.data.files.length > 0 
          ? searchResponse.data.files[0].id 
          : null;

        if (existingFileId) {
          uploadResponse = await drive.files.update({
            fileId: existingFileId,
            media: {
              mimeType: 'application/zip',
              body: bufferStream
            },
            fields: 'id, name, webViewLink'
          });
        } else {
          const fileMetadata = {
            name: `${project.name}.ca.zip`,
            parents: [folderId],
            description: `CAPlayground project: ${project.name}`
          };

          uploadResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: {
              mimeType: 'application/zip',
              body: bufferStream
            },
            fields: 'id, name, webViewLink'
          });
        }

        results.push({
          projectId: project.id,
          success: true,
          fileId: uploadResponse.data.id,
          fileName: uploadResponse.data.name,
          webViewLink: uploadResponse.data.webViewLink,
          updated: !!existingFileId
        });

      } catch (error: any) {
        console.error(`Failed to upload project ${project.id}:`, error);
        results.push({
          projectId: project.id,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return NextResponse.json({ 
      success: true,
      uploaded: successCount,
      total: projects.length,
      results
    });

  } catch (error: any) {
    console.error('Drive upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to upload to Drive',
      details: error.message 
    }, { status: 500 });
  }
}
