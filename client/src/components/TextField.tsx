import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function TextField({ label, ...rest }: TextFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="field-input" {...rest} />
    </label>
  )
}
