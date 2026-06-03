interface Props {
  id: string
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  autoComplete?: string
  mono?: boolean
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']
}

export function FormField({ id, label, type = 'text', value, onChange, placeholder, maxLength, autoComplete, mono, inputMode }: Props) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="form-input"
        style={mono ? { fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', textAlign: 'center' } : undefined}
      />
    </div>
  )
}
