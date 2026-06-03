interface Props {
  steps: string[]
  current: number  // 1-based
}

export function StepPills({ steps, current }: Props) {
  return (
    <div className="steps" role="list" aria-label="Flow steps">
      {steps.map((label, i) => {
        const n = i + 1
        const cls = n < current ? 'done' : n === current ? 'active' : ''
        return (
          <div key={label} className={`step-pill ${cls}`} role="listitem">
            {n} · {label}
          </div>
        )
      })}
    </div>
  )
}
