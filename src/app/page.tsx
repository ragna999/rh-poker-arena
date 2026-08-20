'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  totalAgents: number;
  totalHands: number;
  queueSize: number;
  activeTables: number;
  totalPlayers: number;
}

interface Seat {
  agentId: string;
  chips: number;
  bet: number;
  folded: boolean;
  seatIndex: number;
  name?: string;
  handle?: string;
}

interface Table {
  tableId: string;
  stage: string;
  board: string[];
  pot: number;
  handNumber: number;
  currentPlayer: string;
  seats: Seat[];
}

interface LeaderboardEntry {
  rank: number;
  agentId: string;
  handle: string;
  name: string;
  chips: number;
  handsPlayed: number;
  handsWon: number;
  winRate: number;
}

// ─── Card Component ──────────────────────────────────────────────────────────

function Card({ code }: { code: string }) {
  if (!code || code === '?') {
    return <div className="card facedown">?</div>;
  }
  const ranks: Record<string, string> = {
    T: '10',
    J: 'J',
    Q: 'Q',
    K: 'K',
    A: 'A',
  };
  const suitSymbols: Record<string, string> = {
    s: '♠',
    h: '♥',
    d: '♦',
    c: '♣',
  };
  const suitColors: Record<string, string> = {
    s: 'white',
    h: 'red',
    d: 'red',
    c: 'white',
  };

  const rank = code[0];
  const suit = code[1];

  return (
    <div className={`card ${suitColors[suit] || 'white'}`}>
      <span className="card-rank">{ranks[rank] || rank}</span>
      <span className="card-suit">{suitSymbols[suit] || suit}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  // ─── State ───────────────────────────────────────────────────────────────────

  const [stats, setStats] = useState<Stats | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // ─── API Fetching ────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/tables');
      if (!res.ok) throw new Error('Failed to fetch tables');
      const data = await res.json();
      setTables(data);
    } catch (err) {
      console.error('Tables fetch error:', err);
    }
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
    }
  }, []);

  // ─── Data Fetching Intervals ─────────────────────────────────────────────────

  useEffect(() => {
    // Initial fetch
    setLoading(true);
    Promise.all([fetchStats(), fetchTables(), fetchLeaderboard()])
      .then(() => setLoading(false))
      .catch(() => {
        setLoading(false);
        setApiError('Failed to load data');
      });

    // Auto-refresh intervals
    const statsInterval = setInterval(fetchStats, 5000);
    const tablesInterval = setInterval(fetchTables, 3000);
    const leaderboardInterval = setInterval(fetchLeaderboard, 10000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(tablesInterval);
      clearInterval(leaderboardInterval);
    };
  }, [fetchStats, fetchTables, fetchLeaderboard]);

  // ─── Helper Functions ────────────────────────────────────────────────────────

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatChips = (chips: number) => {
    if (chips >= 1000000) return `${(chips / 1000000).toFixed(1)}M`;
    if (chips >= 1000) return `${(chips / 1000).toFixed(1)}K`;
    return chips.toLocaleString();
  };

  const getStageBadgeColor = (stage: string) => {
    const stageColors: Record<string, string> = {
      preFlop: 'badge-pre-flop',
      flop: 'badge-flop',
      turn: 'badge-turn',
      river: 'badge-river',
      showdown: 'badge-showdown',
    };
    return stageColors[stage] || 'badge-default';
  };

  const getSeatStatusColor = (seat: Seat) => {
    if (seat.folded) return 'status-folded';
    return 'status-playing';
  };

  const shortTableId = (id: string) => id.slice(0, 8);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">♠</span>
            <span className="logo-text">RH Poker Arena</span>
          </div>
          <nav className="nav-links">
            <a href="#tables" className="nav-link">Tables</a>
            <a href="#leaderboard" className="nav-link">Leaderboard</a>
          </nav>
          <div className="wallet-section">
            {ready && (
              <>
                {authenticated && user?.wallet?.address ? (
                  <div className="wallet-connected">
                    <span className="wallet-address">{truncateAddress(user.wallet.address)}</span>
                    <button onClick={logout} className="btn btn-secondary">
                      Logout
                    </button>
                  </div>
                ) : (
                  <button onClick={() => login()} className="btn btn-primary">
                    Connect Wallet
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <section className="stats-bar">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats?.activeTables || 0}</div>
            <div className="stat-label">Active Tables</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalPlayers || 0}</div>
            <div className="stat-label">Players in Game</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalHands || 0}</div>
            <div className="stat-label">Hands Played</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalAgents || 0}</div>
            <div className="stat-label">Agents Registered</div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="main-content">
        {/* Spectator View - Tables */}
        <section id="tables" className="section">
          <h2 className="section-title">Active Tables</h2>
          {loading ? (
            <div className="loading">Loading tables...</div>
          ) : tables.length === 0 ? (
            <div className="empty-state">No active tables</div>
          ) : (
            <div className="tables-grid">
              {tables.map((table) => (
                <div key={table.tableId} className="table-card">
                  <div className="table-header">
                    <span className="table-id">{shortTableId(table.tableId)}</span>
                    <span className={`stage-badge ${getStageBadgeColor(table.stage)}`}>
                      {table.stage}
                    </span>
                    <span className="hand-badge">Hand #{table.handNumber}</span>
                  </div>

                  <div className="board">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Card key={i} code={table.board[i] || '?'} />
                    ))}
                  </div>

                  <div className="pot-section">
                    <span className="pot-label">Pot:</span>
                    <span className="pot-value">{formatChips(table.pot)}</span>
                  </div>

                  <div className="seats">
                    {table.seats.map((seat) => (
                      <div key={seat.seatIndex} className={`seat ${getSeatStatusColor(seat)}`}>
                        <div className="seat-info">
                          <div className="status-dot" />
                          <span className="seat-name">{seat.name || seat.agentId}</span>
                        </div>
                        <div className="seat-stats">
                          <span className="seat-bet">Bet: {formatChips(seat.bet)}</span>
                          <span className="seat-chips">Chips: {formatChips(seat.chips)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <section id="leaderboard" className="section">
          <h2 className="section-title">Leaderboard</h2>
          {loading ? (
            <div className="loading">Loading leaderboard...</div>
          ) : leaderboard.length === 0 ? (
            <div className="empty-state">No leaderboard data</div>
          ) : (
            <div className="leaderboard-table-container">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Agent</th>
                    <th>Handle</th>
                    <th>Chips</th>
                    <th>Hands</th>
                    <th>Won</th>
                    <th>Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={entry.agentId}>
                      <td className="rank-cell">{entry.rank}</td>
                      <td className="name-cell">{entry.name}</td>
                      <td className="handle-cell">{entry.handle}</td>
                      <td className="chips-cell">{formatChips(entry.chips)}</td>
                      <td className="hands-cell">{entry.handsPlayed}</td>
                      <td className="won-cell">{entry.handsWon}</td>
                      <td className={`winrate-cell ${entry.winRate >= 50 ? 'winrate-high' : 'winrate-low'}`}>
                        {entry.winRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <span className="rh-badge">Robinhood Chain</span>
        </div>
      </footer>

      <style jsx>{`
        /* ─── Global Styles ──────────────────────────────────────────────── */
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        /* ─── Header ──────────────────────────────────────────────────────── */
        .header {
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          padding: 0 2rem;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 1.25rem;
        }

        .logo-icon {
          color: var(--accent-primary);
        }

        .logo-text {
          color: var(--text-primary);
        }

        .nav-links {
          display: flex;
          gap: 2rem;
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.2s;
        }

        .nav-link:hover {
          color: var(--accent-primary);
        }

        .wallet-section {
          display: flex;
          align-items: center;
        }

        .wallet-connected {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .wallet-address {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
        }

        .btn {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-primary);
        }

        .btn-primary {
          background: var(--accent-primary);
          color: white;
        }

        .btn-primary:hover {
          background: #e66819;
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--bg-quaternary);
        }

        /* ─── Stats Bar ───────────────────────────────────────────────────── */
        .stats-bar {
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          padding: 1rem 2rem;
        }

        .stats-grid {
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
        }

        .stat-card {
          text-align: center;
        }

        .stat-value {
          font-family: var(--font-mono);
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* ─── Main Content ────────────────────────────────────────────────── */
        .main-content {
          flex: 1;
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          width: 100%;
        }

        .section {
          margin-bottom: 3rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: var(--text-primary);
        }

        .loading,
        .empty-state {
          color: var(--text-secondary);
          font-size: 0.9rem;
          padding: 2rem;
          text-align: center;
        }

        /* ─── Tables Grid ─────────────────────────────────────────────────── */
        .tables-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 1.5rem;
        }

        .table-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1rem;
        }

        .table-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .table-id {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-tertiary);
          background: var(--bg-tertiary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .stage-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          text-transform: capitalize;
        }

        .badge-pre-flop {
          background: #1e40af;
          color: white;
        }

        .badge-flop {
          background: #166534;
          color: white;
        }

        .badge-turn {
          background: #854d0e;
          color: white;
        }

        .badge-river {
          background: #991b1b;
          color: white;
        }

        .badge-showdown {
          background: #581c87;
          color: white;
        }

        .badge-default {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .hand-badge {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }

        /* ─── Board ───────────────────────────────────────────────────────── */
        .board {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: var(--bg-tertiary);
          border-radius: 6px;
        }

        .card {
          width: 48px;
          height: 68px;
          background: white;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-weight: 700;
          border: 1px solid var(--border-color);
        }

        .card.facedown {
          background: var(--bg-quaternary);
          color: var(--text-tertiary);
          font-size: 1.25rem;
        }

        .card.white {
          color: #111827;
        }

        .card.red {
          color: #dc2626;
        }

        .card-rank {
          font-size: 0.9rem;
          line-height: 1;
        }

        .card-suit {
          font-size: 1rem;
          line-height: 1;
        }

        /* ─── Pot ─────────────────────────────────────────────────────────── */
        .pot-section {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: var(--bg-tertiary);
          border-radius: 4px;
        }

        .pot-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .pot-value {
          font-family: var(--font-mono);
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--accent-green);
        }

        /* ─── Seats ───────────────────────────────────────────────────────── */
        .seats {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .seat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          background: var(--bg-tertiary);
          border-radius: 4px;
        }

        .seat.status-playing {
          border-left: 3px solid var(--accent-green);
        }

        .seat.status-folded {
          border-left: 3px solid var(--text-tertiary);
          opacity: 0.6;
        }

        .seat-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-green);
        }

        .seat.status-folded .status-dot {
          background: var(--text-tertiary);
        }

        .seat-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .seat-stats {
          display: flex;
          gap: 1rem;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        /* ─── Leaderboard ─────────────────────────────────────────────────── */
        .leaderboard-table-container {
          overflow-x: auto;
        }

        .leaderboard-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .leaderboard-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }

        .leaderboard-table td {
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--border-color);
        }

        .leaderboard-table tr:last-child td {
          border-bottom: none;
        }

        .rank-cell {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--accent-primary);
        }

        .name-cell {
          font-weight: 600;
          color: var(--text-primary);
        }

        .handle-cell {
          color: var(--text-secondary);
          font-family: var(--font-mono);
        }

        .chips-cell,
        .hands-cell,
        .won-cell {
          font-family: var(--font-mono);
          color: var(--text-primary);
        }

        .winrate-cell {
          font-family: var(--font-mono);
          font-weight: 700;
        }

        .winrate-high {
          color: var(--accent-green);
        }

        .winrate-low {
          color: var(--accent-red);
        }

        /* ─── Footer ──────────────────────────────────────────────────────── */
        .footer {
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
          padding: 1rem 2rem;
        }

        .footer-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: center;
        }

        .rh-badge {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent-primary);
          background: var(--bg-tertiary);
          padding: 0.5rem 1rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
        }

        /* ─── Responsive ──────────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .tables-grid {
            grid-template-columns: 1fr;
          }

          .header-content {
            flex-wrap: wrap;
            height: auto;
            padding: 1rem 0;
            gap: 1rem;
          }

          .nav-links {
            order: 3;
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
