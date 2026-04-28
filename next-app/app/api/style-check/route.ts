import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../../../lib/apiAuth';
import { supabase } from '@winaid/blog-core';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  const hospitalName = request.nextUrl.searchParams.get('hospitalName');
  if (!hospitalName || !supabase) {
    return NextResponse.json({ hasProfile: false });
  }

  try {
    const { data } = await supabase
      .from('hospital_style_profiles')
      .select('hospital_name, last_crawled_at')
      .eq('hospital_name', hospitalName.trim())
      .not('style_profile', 'is', null)
      .maybeSingle();

    return NextResponse.json({
      hasProfile: !!data,
      hospitalName: data?.hospital_name,
      lastCrawledAt: data?.last_crawled_at,
    });
  } catch {
    return NextResponse.json({ hasProfile: false });
  }
}
