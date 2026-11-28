import * as React from 'react'
import type { SessionGoal } from '@craft-agent/core/types'
import type { ComponentEntry } from './types'
import { FreeFormInput } from '@/components/app-shell/input/FreeFormInput'
import { GoalBannerView } from '@/components/app-shell/input/GoalBanner'

// ============================================================================
// Claude /goal banner, attached above the real composer card. One frame per state
// (ids goal-shot-*).
// ============================================================================

const CONDITION = 'bun run typecheck:all exits 0 and bun test packages/shared/src/sessions reports 0 fail'
const REASON = 'The last typecheck run still reports 2 errors in SessionManager.ts (TS2367 at line 10235).'
const LONG = 'Every test in packages/shared passes, the docs site builds without warnings, and CHANGELOG.md lists each user-facing change in this release with a link to its pull request.'

const GOALS: Record<string, SessionGoal> = {
  fresh: { condition: CONDITION, status: 'active', setAt: 1, iterations: 0 },
  checks: { condition: CONDITION, status: 'active', setAt: 1, iterations: 3, lastReason: REASON },
  long: { condition: LONG, status: 'active', setAt: 1, iterations: 5, lastReason: 'Two tests in packages/shared/src/sessions still fail, and CHANGELOG.md has no entry for the new goal banner yet.' },
  achieved: { condition: CONDITION, status: 'achieved', setAt: 1, iterations: 3, achievedAt: 2 },
}

function Composer({ isProcessing = false }: { isProcessing?: boolean }) {
  const [model, setModel] = React.useState('claude-opus-5-5')
  const [value, setValue] = React.useState('')
  return (
    <FreeFormInput
      placeholder="Message Craft Agent…"
      currentModel={model}
      onModelChange={setModel}
      permissionMode="allow-all"
      onPermissionModeChange={() => {}}
      inputValue={value}
      onInputChange={setValue}
      sessionId="goal-banner-demo"
      isProcessing={isProcessing}
      onSubmit={() => {}}
      onStop={() => {}}
    />
  )
}

/** The banner over the real composer card, stacked as in ChatInputZone. */
function Demo({ id, title, width, goal, isProcessing }: { id: string; title: string; width: number; goal: SessionGoal; isProcessing?: boolean }) {
  return (
    <div id={id} className="bg-background p-5" style={{ width }}>
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <GoalBannerView goal={goal} isProcessing={!!isProcessing} onClear={() => {}} />
      <div className="relative"><Composer isProcessing={isProcessing} /></div>
    </div>
  )
}

function GoalBannerDemo() {
  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <Demo id="goal-shot-checks" title="Not met yet after 3 checks, with the last reason" width={760} goal={GOALS.checks} />
      <Demo id="goal-shot-fresh" title="Just set, agent working (clear waits for Stop)" width={760} goal={GOALS.fresh} isProcessing />
      <Demo id="goal-shot-achieved" title="Achieved (shown until the next message)" width={760} goal={GOALS.achieved} />
      <Demo id="goal-shot-narrow" title="Narrow panel, long goal (click to expand)" width={460} goal={GOALS.long} />
    </div>
  )
}

export const goalBannerComponents: ComponentEntry[] = [
  {
    id: 'goal-banner',
    name: 'Goal Banner',
    category: 'Chat Inputs',
    description: 'Claude /goal banner attached above the composer card',
    component: GoalBannerDemo,
    layout: 'full',
    props: [],
    variants: [],
    mockData: () => ({}),
  },
]
