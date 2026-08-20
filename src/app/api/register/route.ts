import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createAgent, getAgentByWallet } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { walletAddress, handle, name } = await req.json();
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress required' }, { status: 400 });
    }

    const existing = await getAgentByWallet(walletAddress);
    if (existing) {
      return NextResponse.json({
        agentId: existing.agentId,
        apiKey: existing.apiKey,
        chips: existing.chips,
        message: 'Already registered'
      });
    }

    const baseChips = 10000;
    const agentId = nanoid(16);
    const apiKey = 'rhp_' + nanoid(48);

    await createAgent({
      agentId,
      walletAddress,
      handle: handle || agentId.slice(0, 8),
      name: name || handle || 'Anonymous',
      apiKey,
      chips: baseChips
    });

    return NextResponse.json({ agentId, apiKey, chips: baseChips, message: 'Registered successfully' });
  } catch (e: any) {
    console.error('Register error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
