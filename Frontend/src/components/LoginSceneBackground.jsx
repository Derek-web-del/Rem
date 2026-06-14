import { useMemo } from 'react'
import GlendaleLogo from '../assets/GlendaleLogo.png'

const STAR_COUNT = 60

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function LoginSceneBackground() {
  const stars = useMemo(() => {
    const rand = mulberry32(42)
    return Array.from({ length: STAR_COUNT }, (_, i) => ({
      id: i,
      size: rand() * 2 + 1,
      top: rand() * 65,
      left: rand() * 100,
      delay: rand() * 3,
      duration: 2 + rand() * 3,
    }))
  }, [])

  return (
    <div className="login-scene pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="login-scene__sky" />
      <div className="login-scene__glow-blue" />
      <div className="login-scene__glow-green" />

      <div className="login-scene__stars">
        {stars.map((star) => (
          <div
            key={star.id}
            className="login-scene__star"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              top: `${star.top}%`,
              left: `${star.left}%`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="login-scene__globe-wrap">
        <div className="login-scene__globe">
          <div className="login-scene__land login-scene__land--1" />
          <div className="login-scene__land login-scene__land--2" />
          <div className="login-scene__land login-scene__land--3" />
          <div className="login-scene__land login-scene__land--4" />
          <div className="login-scene__land login-scene__land--5" />
          <div className="login-scene__land login-scene__land--6" />
          <div className="login-scene__globe-grid" />
          <div className="login-scene__globe-shine" />
        </div>
        <div className="login-scene__globe-ring login-scene__globe-ring--1" />
        <div className="login-scene__globe-ring login-scene__globe-ring--2" />
      </div>

      <svg
        className="login-scene__leaf login-scene__leaf--left"
        viewBox="0 0 80 120"
        aria-hidden="true"
      >
        <path
          d="M40 110 C40 110 5 80 5 45 C5 20 20 5 40 5 C60 5 75 20 75 45 C75 80 40 110 40 110Z"
          fill="#1e7a44"
          opacity="0.7"
        />
        <line x1="40" y1="110" x2="40" y2="10" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1="40" y1="60" x2="18" y2="40" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
        <line x1="40" y1="60" x2="62" y2="40" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
      </svg>

      <svg
        className="login-scene__leaf login-scene__leaf--right"
        viewBox="0 0 80 120"
        aria-hidden="true"
      >
        <path
          d="M40 110 C40 110 5 80 5 45 C5 20 20 5 40 5 C60 5 75 20 75 45 C75 80 40 110 40 110Z"
          fill="#1a6b3c"
          opacity="0.7"
        />
        <line x1="40" y1="110" x2="40" y2="10" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      </svg>

      <svg
        className="login-scene__leaf login-scene__leaf--small"
        viewBox="0 0 80 120"
        aria-hidden="true"
      >
        <path
          d="M40 110 C40 110 5 80 5 45 C5 20 20 5 40 5 C60 5 75 20 75 45 C75 80 40 110 40 110Z"
          fill="#22a052"
        />
      </svg>

      <svg className="login-scene__connections" aria-hidden="true">
        <circle cx="22%" cy="35%" r="3" fill="rgba(80,220,130,0.5)" />
        <circle cx="72%" cy="28%" r="2.5" fill="rgba(80,200,255,0.4)" />
        <circle cx="60%" cy="48%" r="2" fill="rgba(80,220,130,0.35)" />
        <circle cx="30%" cy="55%" r="2" fill="rgba(80,200,255,0.3)" />
        <circle cx="78%" cy="55%" r="2.5" fill="rgba(80,220,130,0.4)" />
        <circle cx="15%" cy="60%" r="1.5" fill="rgba(120,220,150,0.3)" />
        <line
          x1="22%"
          y1="35%"
          x2="50%"
          y2="42%"
          stroke="rgba(80,220,130,0.15)"
          strokeWidth="1"
          strokeDasharray="3,4"
        />
        <line
          x1="72%"
          y1="28%"
          x2="50%"
          y2="42%"
          stroke="rgba(80,200,255,0.12)"
          strokeWidth="1"
          strokeDasharray="3,4"
        />
        <line
          x1="60%"
          y1="48%"
          x2="50%"
          y2="42%"
          stroke="rgba(80,220,130,0.1)"
          strokeWidth="1"
          strokeDasharray="3,4"
        />
        <line
          x1="30%"
          y1="55%"
          x2="22%"
          y2="35%"
          stroke="rgba(80,200,255,0.1)"
          strokeWidth="1"
          strokeDasharray="3,4"
        />
        <line
          x1="78%"
          y1="55%"
          x2="72%"
          y2="28%"
          stroke="rgba(80,220,130,0.1)"
          strokeWidth="1"
          strokeDasharray="3,4"
        />
      </svg>

      <div className="login-scene__badge-top">
        <div className="login-scene__badge-seal">
          <img src={GlendaleLogo} alt="" />
        </div>
        <span className="login-scene__badge-text">Glendale School</span>
      </div>

      <div className="login-scene__tagline">
        <div className="login-scene__tagline-sm">Home of</div>
        <div className="login-scene__tagline-lg">
          Achievers · Leaders
          <em>Change-Makers</em>
        </div>
      </div>

      <div className="login-scene__bottom-bar">
        <span>Glendale School · Est. 1996</span>
      </div>
    </div>
  )
}
