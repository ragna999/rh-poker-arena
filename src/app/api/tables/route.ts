import { NextResponse } from 'next/server';
import { getMatchmaker } from '@/lib/matchmaker';

export async function GET() {
  try {
    const mm = getMatchmaker();
    const tables = await mm.getActiveTables();
    return NextResponse.json(tables);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
