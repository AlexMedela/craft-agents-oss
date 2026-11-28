import { describe, expect, it } from 'bun:test';
import { ClaudeEventAdapter } from '../backend/claude/event-adapter.ts';

function adapter() {
  const value = new ClaudeEventAdapter({ mapSDKError: async () => { throw new Error('Unexpected SDK error'); } });
  value.startTurn();
  return value;
}

// Shapes as the SDK sends them (claude-agent-sdk 0.3.321)
const feedback = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
  parent_tool_use_id: null,
  isSynthetic: true,
  ...extra,
}) as any;
const FEEDBACK_TEXT = 'Stop hook feedback:\n[counter.txt contains 3]: The counter file contains 1, not 3.';
const result = (subtype: string) => ({
  type: 'result', subtype, is_error: subtype !== 'success', num_turns: 9, errors: subtype === 'success' ? undefined : ['boom'],
  usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0,
}) as any;

describe('Claude /goal events', () => {
  it('turns the goal check feedback into goal_feedback', async () => {
    expect(await adapter().adapt(feedback(FEEDBACK_TEXT))).toEqual([{ type: 'goal_feedback', text: FEEDBACK_TEXT }]);
  });

  it('ignores user text that is not synthetic Stop hook feedback', async () => {
    const value = adapter();
    expect(await value.adapt(feedback(FEEDBACK_TEXT, { isSynthetic: false }))).toEqual([]);
    expect(await value.adapt(feedback('Some other synthetic note'))).toEqual([]);
    expect(await value.adapt(feedback(FEEDBACK_TEXT, { parent_tool_use_id: 'toolu_1' }))).toEqual([]);
  });

  it('marks the complete event with the SDK result', async () => {
    const ok = await adapter().adapt(result('success'));
    expect(ok.find(e => e.type === 'complete')).toMatchObject({ sdkResult: 'success' });
    const failed = await adapter().adapt(result('error_during_execution'));
    expect(failed.find(e => e.type === 'complete')).toMatchObject({ sdkResult: 'error' });
  });

  it('maps the SDK active_goal state', async () => {
    const value = adapter();
    expect(await value.adapt({ type: 'active_goal', value: { condition: 'tests pass', iterations: 2, set_at: 1, tokens_at_start: 0, last_reason: 'two fail' }, uuid: 'u', session_id: 's' } as any))
      .toEqual([{ type: 'goal_state', goal: { condition: 'tests pass', iterations: 2, lastReason: 'two fail' } }]);
    expect(await value.adapt({ type: 'active_goal', value: null, uuid: 'u', session_id: 's' } as any))
      .toEqual([{ type: 'goal_state', goal: null }]);
  });
});
