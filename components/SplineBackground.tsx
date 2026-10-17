
"use client";

import Spline from "@splinetool/react-spline";

export default function SplineBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Animated 3D scene */}
      <div className="absolute inset-0 animate-scene">
        <Spline scene="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode" />
      </div>

      {/* Dark cinematic overlay */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Subtle blue and violet ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(30,100,255,0.12),transparent_55%)]" />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),transparent_45%,rgba(0,0,0,0.5))]" />
    </div>
  );
}
