import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { CircleCheck, Target, X } from 'lucide-react'
import type { SessionGoal } from '@craft-agent/core/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { cn } from '@/lib/utils'
import { sessionAtomFamily } from '@/atoms/sessions'

/** Just the session's goal: the banner re-renders when the goal changes, not on every streamed delta. */
const sessionGoalAtomFamily = atomFamily((sessionId: string) =>
  selectAtom(sessionAtomFamily(sessionId), session => session?.goal),
)

interface GoalBannerViewProps {
  goal: SessionGoal
  isProcessing: boolean
  /** Sends /goal clear (only while idle: a goal turn ends once the goal is met or the turn is stopped) */
  onClear: () => void
  className?: string
}

/**
 * Claude /goal banner, attached above the composer card at its full width (ChatInputZone): the goal
 * the agent works toward, how many checks found it not met yet and why, and a clear action. Click
 * it to show the full condition and reason.
 */
export function GoalBannerView({ goal, isProcessing, onClear, className }: GoalBannerViewProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  const achieved = goal.status === 'achieved'
  const status = achieved
    ? (goal.iterations > 0 ? t('chat.goal.achievedAfter', { count: goal.iterations + 1 }) : t('chat.goal.achievedHint'))
    : goal.iterations > 0 ? t('chat.goal.checksNotMetShort', { count: goal.iterations }) : t('chat.goal.notCheckedYetShort')

  return (
    <div
      className={cn(
        // Tucked under the card, which covers its bottom 12px (the card comes later and paints on top)
        'relative z-0 -mb-3 rounded-t-xl px-3 pt-2 pb-5 text-label-sm ring-1 ring-inset ring-border/60',
        achieved ? 'bg-success-tint' : 'bg-accent-tint',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {achieved
          ? <CircleCheck aria-hidden className="size-3.5 shrink-0 text-success" />
          : <Target aria-hidden className="size-3.5 shrink-0 text-accent" />}
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span className={cn('shrink-0 font-medium', achieved ? 'text-success' : 'text-accent')}>
            {achieved ? t('chat.goal.achieved') : t('chat.goal.label')}
          </span>
          <span className={cn('min-w-0 flex-1 text-foreground', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')}>
            {goal.condition}
          </span>
        </button>
        <span className="shrink-0 tabular-nums text-tertiary">{status}</span>
        {!achieved && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => { if (!isProcessing) onClear() }}
                aria-disabled={isProcessing}
                aria-label={t('chat.goal.clear')}
                className={cn(
                  'motion-press -mr-1 inline-grid size-6 shrink-0 place-items-center rounded-full text-tertiary',
                  isProcessing ? 'cursor-default opacity-50' : 'hover:bg-fill-hover hover:text-foreground',
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{isProcessing ? t('chat.goal.stopToClear') : t('chat.goal.clear')}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {!achieved && goal.lastReason && (
        <div className={cn('mt-0.5 pl-5.5 text-secondary', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')}>
          {t('chat.goal.lastCheck', { reason: goal.lastReason })}
        </div>
      )}
    </div>
  )
}

interface GoalBannerProps {
  sessionId: string
  isProcessing: boolean
  onClear: () => void
}

/** The session's goal banner; renders nothing without a goal. */
export function GoalBanner({ sessionId, ...props }: GoalBannerProps) {
  const goal = useAtomValue(sessionGoalAtomFamily(sessionId))
  if (!goal) return null
  return <GoalBannerView goal={goal} {...props} />
}
