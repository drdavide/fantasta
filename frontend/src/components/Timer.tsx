// ─────────────────────────────────────────────
// src/components/Timer.tsx
// Countdown timer displayed during bidding.
// Changes colour as time runs out.
// ─────────────────────────────────────────────

import { useEffect, useState } from "react"
import { useAuction } from "../context/AuctionContext"

interface TimerProps {
  /** Total seconds for the timer (from auction settings) */
  totalSeconds: number
}

export default function Timer({ totalSeconds }: TimerProps) {
  const { timeRemaining } = useAuction()

  // ── Colour thresholds ──────────────────────
  // Green  → more than 50% time remaining
  // Yellow → between 25% and 50%
  // Red    → less than 25% (urgent!)
  const percentage = totalSeconds > 0 ? (timeRemaining / totalSeconds) * 100 : 0

  const colorClass =
    percentage > 50
      ? "text-green-400"
      : percentage > 25
      ? "text-yellow-400"
      : "text-red-400"

  const ringColor =
    percentage > 50
      ? "stroke-green-400"
      : percentage > 25
      ? "stroke-yellow-400"
      : "stroke-red-400"

  const bgRingColor =
    percentage > 50
      ? "stroke-green-900"
      : percentage > 25
      ? "stroke-yellow-900"
      : "stroke-red-900"

  // ── Circular progress ──────────────────────
  // SVG circle trick: use strokeDashoffset to
  // animate the arc based on time remaining
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (percentage / 100) * circumference

  // ── Pulse animation when urgent ───────────
  const shouldPulse = percentage <= 25 && timeRemaining > 0

  return (
    <div className="flex flex-col items-center justify-center">

      {/* Circular timer */}
      <div className={`relative ${shouldPulse ? "animate-pulse" : ""}`}>
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          className="-rotate-90"
        >
          {/* Background ring */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            strokeWidth="6"
            className={bgRingColor}
          />
          {/* Progress ring */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={`${ringColor} transition-all duration-1000 ease-linear`}
          />
        </svg>

        {/* Time number in the centre */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>
            {timeRemaining}
          </span>
        </div>
      </div>

      {/* Label */}
      <p className="text-gray-500 text-xs mt-2 tracking-wider uppercase">
        {timeRemaining === 0 ? "VENDUTO!" : "secondi"}
      </p>

    </div>
  )
}