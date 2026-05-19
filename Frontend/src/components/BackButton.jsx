import { useNavigate } from 'react-router-dom'
import { BACK_BUTTON_CLASS } from '../pages/teachers/instituteChrome.js'

export { BACK_BUTTON_CLASS }

function mergeClassName(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Global « Back control for faculty, admin, and institute pages.
 * Pass `to` for router navigation, or `onClick` for custom handlers.
 */
export default function BackButton({
  className = '',
  to,
  onClick,
  disabled,
  children = '« Back',
  type = 'button',
  ...rest
}) {
  const navigate = useNavigate()

  function handleClick(ev) {
    if (disabled) return
    if (onClick) {
      onClick(ev)
      return
    }
    if (to) navigate(to)
    else navigate(-1)
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={handleClick}
      className={mergeClassName(BACK_BUTTON_CLASS, className)}
      {...rest}
    >
      {children}
    </button>
  )
}
