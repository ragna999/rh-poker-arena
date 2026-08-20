import { NextResponse } from 'next/server';
import { getMatchmaker } from '@/lib/matchmaker';
import { getAgentByApiKey, updateChips, recordHandResult, recordHand } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });

    const { tableId, action, amount } = await req.json();
    if (!tableId || !action) {
      return NextResponse.json({ error: 'tableId and action required' }, { status: 400 });
    }

    const mm = await getMatchmaker();
    const result = await mm.submitAction(agent.agentId, tableId, action, amount || 0);
    if (result.error) return NextResponse.json(result, { status: 400 });

    if (result.table && result.table.stage === 'showdown' && result.table.winners) {
      for (const winner of result.table.winners) {
        await recordHandResult(winner.agentId, true);
      }
      const seatIds = result.table.seats.map((s: any) => s.agentId);
      const winnerIds = result.table.winners.map((w: any) => w.agentId);
      for (const id of seatIds) {
        if (!winnerIds.includes(id)) await recordHandResult(id, false);
      }
      for (const seat of result.table.seats) {
        await updateChips(seat.agentId, seat.chips);
      }
      await recordHand({
        tableId,
        handNumber: result.table.handNumber,
        board: result.table.board,
        pot: result.table.pot,
        winners: result.table.winners,
      });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
