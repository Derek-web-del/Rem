import BackButton from '../../components/BackButton.jsx'

/** Faculty pages — re-exports the global blue « Back button. */
export default function TeacherBackButton({ className = 'mb-2', to, onClick, disabled }) {
  return <BackButton className={className} to={to} onClick={onClick} disabled={disabled} />
}
