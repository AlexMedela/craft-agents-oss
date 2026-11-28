/**
 * Session goals (Claude `/goal`).
 *
 * The Claude Agent SDK runs the goal loop itself: `/goal <condition>` registers a session Stop hook,
 * and after each turn a small model checks the condition. While it is not met the check's reason is
 * fed back to the agent (a synthetic "Stop hook feedback" user message) and the turn goes on; once it
 * is met the turn ends and the SDK clears the goal. The SDK does not report its goal state to an SDK
 * host, so Craft mirrors it from what it does see: the command, the feedback and the turn's result.
 *
 * Everything that depends on the SDK's wording lives here, so an SDK update that changes it only
 * degrades the indicator (check count and reason), never the loop, which stays the SDK's.
 */

import type { SessionGoal } from '@craft-agent/core/types'

/** Longest condition the SDK accepts; it refuses a longer one and keeps the current goal. */
export const GOAL_CONDITION_MAX_LENGTH = 4000

/** Arguments that clear the goal (the SDK's own list). */
const CLEAR_ARGUMENTS = new Set(['clear', 'stop', 'off', 'reset', 'none', 'cancel'])

/** How the SDK prefixes the text a blocking Stop hook feeds back to the agent. */
const STOP_HOOK_FEEDBACK_PREFIX = 'Stop hook feedback:'

export type GoalCommand =
  | { kind: 'set'; condition: string }
  | { kind: 'clear' }
  /** `/goal` alone: the SDK reports the goal, nothing changes. */
  | { kind: 'status' }
  /** A condition the SDK refuses (too long): nothing changes. */
  | { kind: 'rejected' }

/** The `/goal` command in a message, or null when the message is not one. */
export function parseGoalCommand(message: string): GoalCommand | null {
  const match = message.trim().match(/^\/goal(?:\s+([\s\S]*))?$/i)
  if (!match) return null
  const argument = (match[1] ?? '').trim()
  if (!argument) return { kind: 'status' }
  if (CLEAR_ARGUMENTS.has(argument.toLowerCase())) return { kind: 'clear' }
  if (argument.length > GOAL_CONDITION_MAX_LENGTH) return { kind: 'rejected' }
  return { kind: 'set', condition: argument }
}

/** Whether a synthetic user message is a Stop hook's feedback (the goal check's among them). */
export function isStopHookFeedback(text: string): boolean {
  return text.trimStart().startsWith(STOP_HOOK_FEEDBACK_PREFIX)
}

/**
 * The goal check's reason in a Stop hook feedback text (`[<condition>]: <reason>`), or null when the
 * feedback is another hook's.
 */
export function goalFeedbackReason(text: string, condition: string): string | null {
  const marker = `[${condition}]: `
  const at = text.indexOf(marker)
  if (at < 0) return null
  return text.slice(at + marker.length).trim()
}

export type GoalSignal =
  /** A turn starts; `command` is the `/goal` command it runs, if any. */
  | { type: 'turn_start'; command: GoalCommand | null; fromUser: boolean; at: number }
  /** The goal check found the condition not met yet (raw Stop hook feedback). */
  | { type: 'feedback'; text: string }
  /** The SDK reported its goal state (null: cleared or met). */
  | { type: 'sdk_state'; goal: { condition: string; iterations: number; lastReason?: string } | null; at: number }
  /**
   * A turn ended with the SDK's result. With a goal active the SDK only lets a turn end once the
   * condition is met, unless background work deferred the check.
   */
  | { type: 'turn_end'; command: GoalCommand | null; outcome: 'success' | 'error'; backgroundWorkRunning: boolean; at: number }

/** The session's goal after a signal (undefined: no goal). Returns the same object when nothing changed. */
export function nextGoal(goal: SessionGoal | undefined, signal: GoalSignal): SessionGoal | undefined {
  switch (signal.type) {
    case 'turn_start': {
      const { command } = signal
      if (command?.kind === 'set') {
        return { condition: command.condition, status: 'active', setAt: signal.at, iterations: 0 }
      }
      if (command?.kind === 'clear') return undefined
      // An achieved goal shows until the user moves on
      if (goal?.status === 'achieved' && signal.fromUser) return undefined
      return goal
    }
    case 'feedback': {
      if (goal?.status !== 'active') return goal
      const reason = goalFeedbackReason(signal.text, goal.condition)
      if (reason === null) return goal
      return { ...goal, iterations: goal.iterations + 1, lastReason: reason || goal.lastReason }
    }
    case 'sdk_state': {
      const state = signal.goal
      if (!state) {
        return goal?.status === 'active' ? { ...goal, status: 'achieved', achievedAt: signal.at } : goal
      }
      return {
        condition: state.condition,
        status: 'active',
        setAt: goal?.condition === state.condition ? goal.setAt : signal.at,
        iterations: state.iterations,
        ...(state.lastReason ? { lastReason: state.lastReason } : goal?.condition === state.condition && goal.lastReason ? { lastReason: goal.lastReason } : {}),
      }
    }
    case 'turn_end': {
      if (goal?.status !== 'active') return goal
      // A status or clear command's turn runs no check
      if (signal.command && signal.command.kind !== 'set') return goal
      if (signal.outcome !== 'success' || signal.backgroundWorkRunning) return goal
      return { ...goal, status: 'achieved', achievedAt: signal.at }
    }
  }
}
