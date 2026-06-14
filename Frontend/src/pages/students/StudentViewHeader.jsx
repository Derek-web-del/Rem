import BackButton from '../../components/BackButton.jsx'

export default function StudentViewHeader({ title, backTo, onBack, showBack = true }) {
  return (
    <div>
      {showBack ? (
        <BackButton
          className="mb-2 block w-fit text-left"
          to={onBack ? undefined : backTo}
          onClick={onBack}
        />
      ) : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
        {title ? (
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">{title}</h2>
        ) : null}
      </div>
    </div>
  )
}
