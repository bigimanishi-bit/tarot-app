"use client";

import React from "react";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function OccultShell({
  children,
  maxWidth = "max-w-6xl",
  className,
}: {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <main className={clsx("min-h-screen text-[rgba(10,16,28,.92)]", className)}>
      <style>{`
        :root{
          --ink: rgba(10,16,28,.92);
          --muted: rgba(10,16,28,.62);

          --gold: 208,176,108;
          --silver: 210,214,224;

          --bd: rgba(10,16,28,.10);
          --glassTop: rgba(255,255,255,.75);
          --glassBot: rgba(255,255,255,.48);
        }

        .bg{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background: linear-gradient(180deg,#fbfbfe,#f2f5fb);
        }

        .veil{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background:
            radial-gradient(circle at 50% 40%,
              transparent 0 210px,
              rgba(var(--gold), .18) 211px 212px,
              transparent 213px 280px,
              rgba(var(--silver), .18) 281px 282px,
              transparent 283px 360px
            ),
            radial-gradient(rgba(10,16,28,.08) 1px, transparent 1px);
          background-size: auto, 160px 160px;
          background-position: 0 0, 20px 60px;
          opacity: 1;
        }

        .glass{
          background: linear-gradient(180deg,var(--glassTop),var(--glassBot));
          border:1px solid var(--bd);
          box-shadow:
            0 18px 70px rgba(10,16,28,.14),
            inset 0 1px 0 rgba(255,255,255,.7);
          backdrop-filter: blur(18px);
          color: var(--ink);
        }

        .btn{
          border:1px solid rgba(10,16,28,.12);
          background: rgba(255,255,255,.6);
          color: var(--ink);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
        }

        .btnGold{
          border:1px solid rgba(var(--gold),.55);
          background:
            radial-gradient(120% 140% at 20% 10%, rgba(255,255,255,.75), transparent 55%),
            linear-gradient(180deg, rgba(var(--gold), .30), rgba(var(--gold), .14));
          color: var(--ink);
        }

        .field{
          border:1px solid rgba(10,16,28,.14);
          background: rgba(255,255,255,.7);
          color: var(--ink);
        }

        .field::placeholder{
          color: rgba(10,16,28,.45);
        }

        .pill{
          border:1px solid rgba(10,16,28,.12);
          background: rgba(255,255,255,.55);
          color: var(--ink);
        }
      `}</style>

      <div className="bg" />
      <div className="veil" />

      <div className={clsx("relative z-10 mx-auto w-full px-4 py-8", maxWidth)}>
        {children}
      </div>
    </main>
  );
}