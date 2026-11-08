import { useId } from "react";
import type { PartId, VehicleId } from "../lib/toddler-cars";

const PIECES = {
  wheel: { path: "M1068 729a144 144 0 1 0 288 0a144 144 0 1 0-288 0", viewBox: "1048 565 328 328" },
  door: { path: "M1050 252H1198Q1228 252 1244 285L1295 424V548Q1295 572 1268 572H1190Q1134 576 1102 627H1045Q1016 627 1016 599V292Q1016 252 1050 252Z", viewBox: "996 232 319 415" },
  light: { path: "M1434 538a22 51 0 1 0 44 0a22 51 0 1 0-44 0", viewBox: "1418 471 76 134" },
} as const;
const REPAIR_IMAGE = "/images/luke-cars/repair.svg";

export function PartArt({ part }: { part: PartId }) {
  const clip = `part-${useId().replace(/:/g, "")}`;
  const piece = PIECES[part];
  return <svg viewBox={piece.viewBox} aria-hidden="true" data-part-art={part}>
    <defs><clipPath id={clip}><path d={piece.path} /></clipPath></defs>
    <image href={REPAIR_IMAGE} width="1536" height="1024" clipPath={`url(#${clip})`} />
  </svg>;
}

export default function ToddlerCarArt({ kind = "truck", missing, repaired = false }: {
  kind?: VehicleId; missing?: PartId; repaired?: boolean;
}) {
  if (missing) return <svg viewBox="0 80 1536 840" className="toddler-repair-art" aria-hidden="true" data-missing={repaired ? "none" : missing}>
    <image href={REPAIR_IMAGE} width="1536" height="1024" />
    {!repaired && <path d={PIECES[missing].path} fill="#eaf7ff" stroke="#eea737" strokeWidth="10" strokeDasharray="20 12" />}
  </svg>;
  return <img src={`/images/luke-cars/${kind}.svg`} width={960} height={640}
    className="toddler-car-picture" alt="" aria-hidden="true" draggable={false} />;
}
