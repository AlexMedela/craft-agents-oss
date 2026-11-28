/**
 * A session goal set with the Claude Agent SDK's `/goal <condition>` command: after each turn a small
 * model checks the condition and the agent keeps working until it holds. The SDK runs the loop; Craft
 * mirrors its state (from the command, the evaluator's feedback and the turn result) for the UI.
 */
export interface SessionGoal {
  /** The completion condition, as passed to `/goal`. */
  condition: string;
  /** `active` while the SDK pursues it; `achieved` once a turn ended with the condition met. */
  status: 'active' | 'achieved';
  /** When the goal was set (epoch ms). */
  setAt: number;
  /** Checks so far that found the condition not met yet. */
  iterations: number;
  /** The evaluator's latest reason the condition is not met yet. */
  lastReason?: string;
  /** When the goal was achieved (epoch ms). */
  achievedAt?: number;
}
