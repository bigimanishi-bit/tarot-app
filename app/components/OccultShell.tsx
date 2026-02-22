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
    <main className={clsx("min-h-screen text-white", className)}>
      <style>{`
        :root{
          --gold: 226, 180, 92;
          --amber: 255, 196, 120;
          --vio: 160, 110, 255;
          --cya:  90, 220, 255;
          --bd: rgba(255,255,255,.12);
          --glassTop: rgba(255,255,255,.12);
          --glassBot: rgba(255,255,255,.06);
        }

        .bg{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background: url("/assets/occult-bg.jpg");
          background-size: cover;
          background-position: center;
          filter: saturate(1.05) contrast(1.06) brightness(.80);
          opacity: .95;
          transform: scale(1.01);
        }
        .veil{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background:
            radial-gradient(1200px 700px at 50% 25%, rgba(255,255,255,.06), transparent 60%),
            radial-gradient(1000px 650px at 15% 20%, rgba(var(--vio), .10), transparent 62%),
            radial-gradient(900px 600px at 85% 25%, rgba(var(--amber), .10), transparent 65%),
            linear-gradient(180deg, rgba(0,0,0,.60), rgba(0,0,0,.72));
          opacity: .92;
        }
        .dust{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          opacity:.18;
          background-image: radial-gradient(rgba(255,255,255,.35) 1px, transparent 1px);
          background-size: 160px 160px;
          background-position: 10px 40px;
          mask-image: radial-gradient(900px 600px at 40% 18%, #000 30%, transparent 75%);
        }

        .glass{
          background: linear-gradient(180deg, var(--glassTop), var(--glassBot));
          border: 1px solid var(--bd);
          box-shadow:
            0 18px 70px rgba(0,0,0,.55),
            inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter: blur(18px);
        }
        .goldEdge{
          position: relative;
          border-radius: 28px;
        }
        .goldEdge:before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 30px;
          background: linear-gradient(135deg,
            rgba(var(--gold), .35),
            rgba(var(--vio), .18),
            rgba(var(--cya), .14),
            rgba(var(--gold), .22)
          );
          z-index:-1;
          filter: blur(.25px);
          opacity:.85;
        }

        .btn{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
          transition: transform .12s ease, border-color .12s ease, background .12s ease;
        }
        .btn:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.26); background: rgba(255,255,255,.09); }
        .btn:active{ transform: translateY(0px) scale(.99); }

        .btnGold{
          border: 1px solid rgba(var(--gold), .55);
          background:
            radial-gradient(100% 120% at 20% 10%, rgba(255,255,255,.20), transparent 55%),
            linear-gradient(180deg, rgba(var(--gold), .28), rgba(var(--gold), .12));
          color: rgba(255,245,230,.98);
          box-shadow:
            0 14px 40px rgba(0,0,0,.45),
            inset 0 1px 0 rgba(255,255,255,.14);
        }

        .field{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.28);
          outline: none;
        }

        .pill{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.08);
        }

        .heroTitle{
          text-shadow: 0 10px 30px rgba(0,0,0,.55);
          letter-spacing: .02em;
        }
      `}</style>

      <div className="bg" />
      <div className="veil" />
      <div className="dust" />

      <div className={clsx("relative z-10 mx-auto w-full px-4 py-8", maxWidth)}>
        {children}
      </div>
    </main>
  );
}