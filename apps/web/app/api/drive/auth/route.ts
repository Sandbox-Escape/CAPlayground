import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const { data: identitiesData } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const googleIdentity = identitiesData?.user?.identities?.find((id: any) => id.provider === 'google');

    if (!googleIdentity) {
      return NextResponse.json({ 
        connected: false, 
        error: 'Google account not linked' 
      }, { status: 200 });
    }

    return NextResponse.json({ 
      connected: true,
      hasToken: !!googleIdentity.identity_data
    });

  } catch (error: any) {
    console.error('Drive auth check error:', error);
    return NextResponse.json({ 
      error: 'Failed to check Drive connection',
      details: error.message 
    }, { status: 500 });
  }
}
