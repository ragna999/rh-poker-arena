import { NextResponse } from 'next/server';
import { getMatchmaker } from '@/lib/matchmaker';

export async function GET(_req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  try {
    const { tableId } = await params;
    const mm = await getMatchmaker();
    const table = await mm.getTableDetail(tableId);
    if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    return NextResponse.json(table);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
