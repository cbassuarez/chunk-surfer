// PROTOTYPE ONLY. Not part of the game build.
//
// The question this page exists to answer: what does canvasui's ascii-object
// actually look like on one of OUR assets, given the thing it does is render a
// lit 3D object and choose characters against its edges and contours — not
// trace a flat image.
//
// The subject is public/assets/tuning-fork.glb, chosen because it is already a
// game asset AND already one of the eleven hand-rolled bag icons, so this is a
// direct comparison rather than a demo.
import { createRoot } from 'react-dom/client';
import { AsciiObject } from './AsciiObject';

const FORK = '/assets/tuning-fork.glb';

// Roughly the interface's own palette, so the comparison is not confounded by
// the component's default blue ring light.
const VFD = { highlight: '#ffb536', color: '#ffd79a' };

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="cell"><h2>{title}</h2>{children}</div>;
}

// THE ACTUAL QUESTION.
//
// drawBagIcon draws into 12x7 CHARACTER CELLS. Everything else is academic: if
// an object cannot survive that grid there is no icon here, however good it
// looks at forty columns. So each rung renders into a canvas sized to an exact
// character grid, all at the same on-screen scale, and the eye picks the point
// where the fork stops being a fork.
const CELL_PX = 22;               // one character cell, on screen
const ASPECT = 0.6;               // the component's cell width : height

function Rung({ cols, rows }: { cols: number; rows: number }) {
  const w = Math.round(cols * CELL_PX * ASPECT);
  const h = rows * CELL_PX;
  return (
    <div style={{ display:'inline-block', margin:'0 18px 18px 0', verticalAlign:'top' }}>
      <div style={{ width:w, height:h, outline:'1px solid #23232c' }}>
        <AsciiObject src={FORK} scale={7} cellSize={CELL_PX} cellAspect={ASPECT}
          charset="@%#*+=-:. " colored={false} color={VFD.color} highlight={VFD.highlight}
          orbit={false} autoRotate={false} floatIntensity={0} rotationIntensity={0} />
      </div>
      <div style={{ color:'#6d6a5e', marginTop:6 }}>{cols}x{rows} cells</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 24 }}>
    <h2>the fork at real icon sizes — 12x7 is what the bag draws today</h2>
    <div>
      <Rung cols={12} rows={7} />
      <Rung cols={18} rows={10} />
      <Rung cols={26} rows={15} />
      <Rung cols={40} rows={23} />
    </div>
  </div>,
);
