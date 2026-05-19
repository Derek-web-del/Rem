import { useState } from 'react'

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white py-2 pl-3 pr-10 text-sm text-neutral-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500'

export default function PasswordInput({
  value,
  onChange,
  placeholder = '',
  className = inputClass,
  id,
  autoComplete = 'off',
  disabled = false,
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-800"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <i className={`ti ${visible ? 'ti-eye-off' : 'ti-eye'} text-base`} aria-hidden="true" />
      </button>
    </div>
  )
}
