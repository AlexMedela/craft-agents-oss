import { describe, it, expect } from 'bun:test'
import type { SessionGoal } from '@craft-agent/core/types'
import { GOAL_CONDITION_MAX_LENGTH, goalFeedbackReason, isStopHookFeedback, nextGoal, parseGoalCommand } from '../goal'

const active = (over: Partial<SessionGoal> = {}): SessionGoal => ({ condition: 'tests pass', status: 'active', setAt: 1, iterations: 0, ...over })

// Verbatim from the SDK (claude-agent-sdk 0.3.321)
const FEEDBACK = 'Stop hook feedback:\n[tests pass]: The test run still shows 2 failures in auth.test.ts.'

describe('parseGoalCommand', () => {
  it('reads a condition', () => {
    expect(parseGoalCommand('/goal tests pass')).toEqual({ kind: 'set', condition: 'tests pass' })
    expect(parseGoalCommand('  /GOAL   all lint\nerrors fixed  ')).toEqual({ kind: 'set', condition: 'all lint\nerrors fixed' })
  })

  it('reads status and every clear alias', () => {
    expect(parseGoalCommand('/goal')).toEqual({ kind: 'status' })
    expect(parseGoalCommand('/goal   ')).toEqual({ kind: 'status' })
    for (const word of ['clear', 'stop', 'off', 'reset', 'none', 'Cancel']) {
      expect(parseGoalCommand(`/goal ${word}`)).toEqual({ kind: 'clear' })
    }
  })

  it('rejects a condition the SDK would refuse', () => {
    expect(parseGoalCommand(`/goal ${'x'.repeat(GOAL_CONDITION_MAX_LENGTH)}`)?.kind).toBe('set')
    expect(parseGoalCommand(`/goal ${'x'.repeat(GOAL_CONDITION_MAX_LENGTH + 1)}`)).toEqual({ kind: 'rejected' })
  })

  it('ignores other messages', () => {
    expect(parseGoalCommand('/goals')).toBeNull()
    expect(parseGoalCommand('set a /goal for me')).toBeNull()
    expect(parseGoalCommand('/compact')).toBeNull()
  })
})

describe('goal feedback', () => {
  it('recognizes Stop hook feedback and takes the reason for this goal', () => {
    expect(isStopHookFeedback(FEEDBACK)).toBe(true)
    expect(isStopHookFeedback('hello')).toBe(false)
    expect(goalFeedbackReason(FEEDBACK, 'tests pass')).toBe('The test run still shows 2 failures in auth.test.ts.')
    expect(goalFeedbackReason(FEEDBACK, 'something else')).toBeNull()
  })

  it('handles a condition with brackets', () => {
    const text = 'Stop hook feedback:\n[file [a].txt exists]: Not created yet.'
    expect(goalFeedbackReason(text, 'file [a].txt exists')).toBe('Not created yet.')
  })
})

describe('nextGoal', () => {
  it('sets, replaces and clears', () => {
    const set = nextGoal(undefined, { type: 'turn_start', command: { kind: 'set', condition: 'tests pass' }, fromUser: true, at: 5 })
    expect(set).toEqual({ condition: 'tests pass', status: 'active', setAt: 5, iterations: 0 })
    const replaced = nextGoal(active({ iterations: 3 }), { type: 'turn_start', command: { kind: 'set', condition: 'b' }, fromUser: true, at: 6 })
    expect(replaced).toEqual({ condition: 'b', status: 'active', setAt: 6, iterations: 0 })
    expect(nextGoal(active(), { type: 'turn_start', command: { kind: 'clear' }, fromUser: true, at: 7 })).toBeUndefined()
  })

  it('keeps the goal on status, rejected and plain turns', () => {
    const goal = active()
    for (const command of [{ kind: 'status' as const }, { kind: 'rejected' as const }, null]) {
      expect(nextGoal(goal, { type: 'turn_start', command, fromUser: true, at: 2 })).toBe(goal)
    }
  })

  it('drops an achieved goal when the user moves on, not on a background turn', () => {
    const achieved = active({ status: 'achieved', achievedAt: 3 })
    expect(nextGoal(achieved, { type: 'turn_start', command: null, fromUser: false, at: 4 })).toBe(achieved)
    expect(nextGoal(achieved, { type: 'turn_start', command: null, fromUser: true, at: 4 })).toBeUndefined()
  })

  it('counts checks that are not met yet', () => {
    const once = nextGoal(active(), { type: 'feedback', text: FEEDBACK })
    expect(once).toMatchObject({ iterations: 1, lastReason: 'The test run still shows 2 failures in auth.test.ts.' })
    const other = active()
    expect(nextGoal(other, { type: 'feedback', text: 'Stop hook feedback:\n[lint clean]: no' })).toBe(other)
    const achieved = active({ status: 'achieved' })
    expect(nextGoal(achieved, { type: 'feedback', text: FEEDBACK })).toBe(achieved)
  })

  it('is achieved when a goal turn ends with the SDK result', () => {
    const end = { type: 'turn_end' as const, command: null, outcome: 'success' as const, backgroundWorkRunning: false, at: 9 }
    expect(nextGoal(active(), end)).toMatchObject({ status: 'achieved', achievedAt: 9 })
    expect(nextGoal(active(), { ...end, command: { kind: 'set', condition: 'tests pass' } })?.status).toBe('achieved')
  })

  it('stays active when the turn failed, background work deferred the check, or it ran a command', () => {
    const goal = active()
    const end = { type: 'turn_end' as const, command: null, outcome: 'success' as const, backgroundWorkRunning: false, at: 9 }
    expect(nextGoal(goal, { ...end, outcome: 'error' })).toBe(goal)
    expect(nextGoal(goal, { ...end, backgroundWorkRunning: true })).toBe(goal)
    expect(nextGoal(goal, { ...end, command: { kind: 'status' } })).toBe(goal)
    expect(nextGoal(undefined, end)).toBeUndefined()
  })

  it('follows the SDK state when it reports one', () => {
    const goal = active({ setAt: 1, lastReason: 'old' })
    expect(nextGoal(goal, { type: 'sdk_state', goal: { condition: 'tests pass', iterations: 4 }, at: 8 }))
      .toEqual({ condition: 'tests pass', status: 'active', setAt: 1, iterations: 4, lastReason: 'old' })
    expect(nextGoal(goal, { type: 'sdk_state', goal: { condition: 'new', iterations: 0, lastReason: 'r' }, at: 8 }))
      .toEqual({ condition: 'new', status: 'active', setAt: 8, iterations: 0, lastReason: 'r' })
    expect(nextGoal(goal, { type: 'sdk_state', goal: null, at: 8 })).toMatchObject({ status: 'achieved', achievedAt: 8 })
    expect(nextGoal(undefined, { type: 'sdk_state', goal: null, at: 8 })).toBeUndefined()
  })
})
