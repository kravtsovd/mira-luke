import { track } from "./analytics";

type Emit = typeof track;

export class PlaybackAnalytics {
  private videoId: string;
  private state = -1;
  private previousPosition: number | null = null;
  private previousAt = 0;
  private watched = 0;
  private stuckSince: number | null = null;
  private stallReported = false;
  private requestedAt: number | null = null;
  private started = false;

  constructor(videoId: string, private emit: Emit = track, private now = () => performance.now()) {
    this.videoId = videoId;
  }

  event(name: string, properties: Parameters<Emit>[1] = {}) {
    this.emit(name, { video_id: this.videoId, ...properties });
  }

  select(videoId: string) {
    this.flush("video_change");
    this.videoId = videoId;
    this.state = -1;
    this.started = false;
    this.requestedAt = null;
    this.resetSample();
  }

  request() {
    this.requestedAt = this.now();
    this.event("video_play_requested");
  }

  change(state: number) {
    if (state === this.state) return;
    this.flush("state_change");
    if (this.stallReported && state === 1) this.event("video_stall_recovered", { stall_ms: Math.round(this.now() - this.stuckSince!) });
    this.state = state;
    this.resetSample();
    if (state === 1) {
      this.event(this.started ? "video_resumed" : "video_started", {
        startup_ms: this.requestedAt === null ? null : Math.round(this.now() - this.requestedAt),
      });
      this.started = true;
      this.requestedAt = null;
    } else if (state === 3) this.event("video_buffering");
    else if (state === 2 && this.started) this.event("video_paused");
    else if (state === 0) this.event("video_completed");
  }

  sample(position: number, visible: boolean) {
    const at = this.now();
    if (!visible || !Number.isFinite(position) || ![1, 3].includes(this.state)) {
      this.resetSample();
      return;
    }
    if (this.previousPosition !== null) {
      const elapsed = (at - this.previousAt) / 1000;
      const delta = position - this.previousPosition;
      if (elapsed > 0 && elapsed <= 2.5 && delta > 0 && delta <= elapsed + 0.75 && this.state === 1) {
        this.watched += Math.min(delta, elapsed);
        if (this.stallReported) this.event("video_stall_recovered", { stall_ms: Math.round(at - this.stuckSince!) });
        this.stuckSince = null;
        this.stallReported = false;
      } else if (elapsed > 2.5 || delta < 0 || delta > elapsed + 0.75) {
        this.stuckSince = null;
        this.stallReported = false;
      } else {
        this.stuckSince ??= this.previousAt;
        if (!this.stallReported && at - this.stuckSince >= 5000) {
          this.event("video_stalled", { player_state: this.state, position_seconds: Math.round(position), threshold_ms: 5000 });
          this.stallReported = true;
        }
      }
    }
    this.previousAt = at;
    this.previousPosition = position;
    if (this.watched >= 15) this.flush("heartbeat");
  }

  flush(reason: string) {
    if (this.watched > 0) {
      this.event("video_watch_time", { watched_seconds: Math.round(this.watched * 100) / 100, reason });
      this.watched = 0;
    }
  }

  private resetSample() {
    this.previousPosition = null;
    this.previousAt = this.now();
    this.stuckSince = null;
    this.stallReported = false;
  }
}
