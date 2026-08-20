import { NextResponse } from 'next/server';
import { getMatchmaker } from '@/lib/matchmaker';
import { getStats } from '@/lib/db';

export async function GET() {
  try {
    const mm = await getMatchmaker();
    const dbStats = await getStats();
    const mmStats = await mm.getStats();
    return NextResponse.json({ ...dbStats, ...mmStats });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
