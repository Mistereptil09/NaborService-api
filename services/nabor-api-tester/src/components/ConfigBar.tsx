interface Props {
  value: string
  onChange: (v: string) => void
}

export function ConfigBar({ value, onChange }: Props) {
  return (
    <div className="config-bar">
      <label htmlFor="base-url">Base URL</label>
      <input
        id="base-url"
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="http://localhost:3000"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}
