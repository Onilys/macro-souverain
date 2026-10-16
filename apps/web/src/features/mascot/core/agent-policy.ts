import type { Target } from './types';

export type AgentVisualSnapshot = {
  sessionId: string;
  ready?: boolean;
  turn?:
    | 'idle'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'blocked'
    | 'disconnected';
  error?: boolean;
  needsInput?: boolean;
  /** Only an explicitly confirmed end_turn may supply this identity. */
  completedTurnId?: string;
};
export function agentTarget(snapshot: AgentVisualSnapshot): Target {
  if (snapshot.error) return 'failure';
  if (snapshot.needsInput || snapshot.turn === 'blocked') return 'confused';
  if (
    snapshot.turn === 'starting' ||
    snapshot.turn === 'running' ||
    snapshot.turn === 'stopping'
  )
    return 'thinking';
  return 'idle';
}

/** Session-scoped cosmetic policy. It owns no session commands or subscriptions. */
export class AgentMascotAdapter {
  private sessionId?: string;
  private hydrated = false;
  private seen = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private workStarted?: number;
  private celebrating = false;
  private target: Target = 'idle';
  private disposed = false;
  constructor(
    private player: { request: (target: Target) => void },
    private options: {
      celebrateMs?: number;
      minimumWorkMs?: number;
      now?: () => number;
      setTimer?: typeof setTimeout;
      clearTimer?: typeof clearTimeout;
    } = {}
  ) {}
  update(snapshot: AgentVisualSnapshot) {
    if (this.disposed) return;
    if (snapshot.sessionId !== this.sessionId) {
      this.cancel();
      this.sessionId = snapshot.sessionId;
      this.hydrated = false;
      this.seen.clear();
      this.workStarted = undefined;
    }
    if (snapshot.ready === false) {
      this.cancel();
      this.hydrated = false;
      this.workStarted = undefined;
      this.player.request('idle');
      return;
    }
    const id = snapshot.completedTurnId;
    if (!this.hydrated) {
      this.remember(id);
      this.hydrated = true;
    }
    this.target = agentTarget(snapshot);
    const now = (this.options.now ?? Date.now)();
    if (this.target === 'thinking' && this.workStarted === undefined)
      this.workStarted = now;
    if (this.target !== 'idle' || snapshot.turn === 'disconnected') {
      this.remember(id);
      this.cancel();
      this.player.request(this.target);
      if (this.target === 'failure' || snapshot.turn === 'disconnected')
        this.workStarted = undefined;
      return;
    }
    if (id && !this.seen.has(id)) {
      this.remember(id);
      const longEnough = this.hasObservedWork(now);
      this.workStarted = undefined;
      if (longEnough) {
        this.cancel();
        this.celebrating = true;
        this.player.request('smile');
        // Includes routing through neutral and expression entry before the hold.
        this.timer = (this.options.setTimer ?? setTimeout)(() => {
          this.timer = undefined;
          this.celebrating = false;
          this.player.request(this.target);
        }, this.options.celebrateMs ?? 1300);
        return;
      }
    }
    // Cancellation/replacement has no success id and ends the observed work.
    if (!id) this.workStarted = undefined;
    if (!this.celebrating) this.player.request(this.target);
  }
  private hasObservedWork(now: number) {
    return (
      this.workStarted !== undefined &&
      now - this.workStarted >= (this.options.minimumWorkMs ?? 350)
    );
  }
  private remember(id: string | undefined) {
    if (!id) return;
    this.seen.add(id);
    if (this.seen.size > 128)
      this.seen.delete(this.seen.values().next().value!);
  }
  private cancel() {
    if (this.timer !== undefined)
      (this.options.clearTimer ?? clearTimeout)(this.timer);
    this.timer = undefined;
    this.celebrating = false;
  }
  destroy() {
    this.cancel();
    this.disposed = true;
    this.seen.clear();
  }
}
