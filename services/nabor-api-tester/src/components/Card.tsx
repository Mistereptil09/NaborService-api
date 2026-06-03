import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  badge?: string
  children: ReactNode
}

export function Card({ title, badge, children }: Props) {
  return (
    <div className="card">
      <h2 className="card-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
      </h2>
      {children}
    </div>
  )
}
