import { NextResponse } from 'next/server';
import { getMatchmaker } from '@/lib/matchmaker';
import { getAgentByApiKey } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401 });

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });

    const mm = await getMatchmaker();
    const result = await mm.joinQueue(agent.agentId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
