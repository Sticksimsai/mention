"use client";

import { useEffect, useRef } from "react";

// A solid pixel @, extruded as geometry so every angle exists, including the back.
const pixels = [
  "0000111111110000",
  "0001111111111000",
  "0011100000011100",
  "0111000000001110",
  "0110011110000110",
  "1100111111000011",
  "1100000011100011",
  "1100011111100011",
  "1100110001100011",
  "1100110001100011",
  "1100111111100011",
  "1100011110111111",
  "0110000000111110",
  "0111000000000000",
  "0011110000001110",
  "0001111111111110",
  "0000111111111100",
];
type Point = [number, number, number];
type Face = { points: Point[]; normal: Point };
const faces: Face[] = [];
const occupied = (x: number, y: number) => pixels[y]?.[x] === "1";
for (let y = 0; y < pixels.length; y++) for (let x = 0; x < 16; x++) {
  if (!occupied(x, y)) continue;
  const l = x - 8, r = l + 1, t = 8.5 - y, b = t - 1, f = 1.1, k = -1.1;
  faces.push({ points: [[l,t,f],[r,t,f],[r,b,f],[l,b,f]], normal: [0,0,1] });
  faces.push({ points: [[r,t,k],[l,t,k],[l,b,k],[r,b,k]], normal: [0,0,-1] });
  if (!occupied(x-1,y)) faces.push({points:[[l,t,k],[l,t,f],[l,b,f],[l,b,k]],normal:[-1,0,0]});
  if (!occupied(x+1,y)) faces.push({points:[[r,t,f],[r,t,k],[r,b,k],[r,b,f]],normal:[1,0,0]});
  if (!occupied(x,y-1)) faces.push({points:[[l,t,k],[r,t,k],[r,t,f],[l,t,f]],normal:[0,1,0]});
  if (!occupied(x,y+1)) faces.push({points:[[l,b,f],[r,b,f],[r,b,k],[l,b,k]],normal:[0,-1,0]});
}

export function RotatingLogo({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, last = 0, angle = -0.32;
    const tilt = -0.13;
    function draw() {
      if (!ctx || !canvas) return;
      const rotate = ([x,y,z]: Point): Point => {
        const a = x*Math.cos(angle)+z*Math.sin(angle);
        const c = -x*Math.sin(angle)+z*Math.cos(angle);
        return [a,y*Math.cos(tilt)-c*Math.sin(tilt),y*Math.sin(tilt)+c*Math.cos(tilt)];
      };
      ctx.clearRect(0,0,256,256);
      const visible = faces.map(face => ({points:face.points.map(rotate),normal:rotate(face.normal)}))
        .filter(face => face.normal[2] > 0.001)
        .sort((a,b) => a.points.reduce((s,p)=>s+p[2],0)-b.points.reduce((s,p)=>s+p[2],0));
      for (const face of visible) {
        const light = Math.max(0,face.normal[0]*-0.35+face.normal[1]*0.55+face.normal[2]*0.76);
        const shade = 0.32+0.68*light;
        ctx.fillStyle = `rgb(${Math.round(180*shade)},${Math.round(255*shade)},0)`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.45; // Close subpixel seams between adjacent coplanar tiles.
        ctx.beginPath();
        face.points.forEach(([x,y],i) => { const px=128+x*11,py=128-y*11; i ? ctx.lineTo(px,py) : ctx.moveTo(px,py); });
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    function tick(now: number) {
      if (last) angle += Math.min(now-last,50) * Math.PI*2/6500;
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    }
    function start() {
      cancelAnimationFrame(frame); last=0;
      if (reduced.matches) { angle=-0.32; draw(); }
      else frame=requestAnimationFrame(tick);
    }
    start(); reduced.addEventListener("change",start);
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener("change",start); };
  }, []);
  return <canvas ref={ref} width={256} height={256} aria-hidden="true" className={compact ? "h-14 w-14" : "h-20 w-20"} />;
}
