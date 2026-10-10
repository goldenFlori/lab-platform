import { Button, ListBox, Select, Slider, Switch, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { ReactNode } from 'react';
import { KIT, useText } from './text';
import type { Player } from './usePlayer';

/* ------------------------------------------------------------------ */
/* Segmented control (single choice)                                   */
/* ------------------------------------------------------------------ */

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
  fullWidth = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  label: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}) {
  return (
    <div className={`max-w-full overflow-x-auto ${fullWidth ? 'w-full' : ''}`}>
      <ToggleButtonGroup
        aria-label={label}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set([value])}
        onSelectionChange={(keys) => {
          const k = [...keys][0];
          if (k != null) onChange(String(k) as T);
        }}
        size={size}
        fullWidth={fullWidth}
      >
        {options.map((o, i) => (
          <ToggleButton key={o.value} id={o.value} isDisabled={o.disabled}>
            {i > 0 && <ToggleButtonGroup.Separator />}
            {o.icon}
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Labelled field + icon button with tooltip                           */
/* ------------------------------------------------------------------ */

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  variant = 'secondary',
  isDisabled,
  size = 'sm',
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost';
  isDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  // The button is the tooltip's trigger itself: Tooltip.Trigger would wrap it in a second, focusable
  // "button", which doubles every tab stop.
  return (
    <Tooltip delay={400}>
      <Button isIconOnly size={size} variant={variant} aria-label={label} onPress={onPress} isDisabled={isDisabled}>
        {children}
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Transport bar                                                       */
/* ------------------------------------------------------------------ */

const SPEEDS = [
  { value: '0.5', label: '½×' },
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];

export function PlayerBar<S>({ player, compact = false }: { player: Player<S>; compact?: boolean }) {
  const { index, total, playing } = player;
  const single = total <= 1;
  const k = useText(KIT);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5">
        <IconButton label={k.restart} onPress={player.reset} isDisabled={player.atStart}>
          <RotateCcw />
        </IconButton>
        <IconButton label={k.previous} onPress={player.prev} isDisabled={player.atStart}>
          <ChevronLeft />
        </IconButton>
        <Button
          size="sm"
          variant="primary"
          onPress={player.toggle}
          isDisabled={single}
          aria-label={playing ? k.pause : k.play}
          className="min-w-[6.25rem]"
        >
          {playing ? <Pause /> : <Play />}
          {playing ? k.pause : player.atEnd && !single ? k.replay : k.play}
        </Button>
        <IconButton label={k.next} onPress={player.next} isDisabled={player.atEnd}>
          <ChevronRight />
        </IconButton>
        <IconButton label={k.end} onPress={player.end} isDisabled={player.atEnd}>
          <SkipForward />
        </IconButton>
      </div>

      <div className="flex min-w-[10rem] flex-1 items-center gap-3">
        <Slider
          aria-label={k.step}
          className="flex-1"
          minValue={0}
          maxValue={single ? 1 : total - 1}
          value={single ? 0 : index}
          isDisabled={single}
          onChange={(v) => {
            if (typeof v === 'number') player.go(v);
          }}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <span className="min-w-[4.5rem] text-right font-mono text-xs text-muted tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      {!compact && (
        <Segmented
          label={k.speed}
          value={String(player.speed)}
          onChange={(v) => player.setSpeed(Number(v))}
          options={SPEEDS}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact select                                                      */
/* ------------------------------------------------------------------ */

export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className = 'w-48',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(v) => {
        if (v != null && !Array.isArray(v)) onChange(String(v) as T);
      }}
      className={className}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* Inline switch: track on the left, label on the right                */
/* ------------------------------------------------------------------ */

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch isSelected={value} onChange={onChange} size="sm" className="flex-row items-center gap-2">
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Content>
        <span className="text-sm whitespace-nowrap">{label}</span>
      </Switch.Content>
    </Switch>
  );
}
