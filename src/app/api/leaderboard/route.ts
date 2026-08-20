import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const leaderboard = await getLeaderboard(limit);
    return NextResponse.json(leaderboard);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
