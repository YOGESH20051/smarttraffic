
import React, { useRef, useEffect } from 'react';
import { Intersection, Vehicle, Pedestrian, Direction } from '../types';

interface SimulationCanvasProps {
  intersections: Intersection[];
  vehicles: Vehicle[];
  pedestrians: Pedestrian[];
  width: number;
  height: number;
  onIntersectionClick?: (id: string) => void;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ 
  intersections, vehicles, pedestrians, width, height, onIntersectionClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onIntersectionClick || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const int of intersections) {
      const dist = Math.sqrt((int.x - x) ** 2 + (int.y - y) ** 2);
      if (dist < 65) {
        onIntersectionClick(int.id);
        break;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    const roadWidth = 130;

    const drawRoadSegment = (x: number, y: number, w: number, h: number, horizontal: boolean, name: string) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, w, h);
      
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x, y + h/2); ctx.lineTo(x + w, y + h/2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.setLineDash([20, 20]);
        ctx.moveTo(x, y + h/4); ctx.lineTo(x + w, y + h/4);
        ctx.moveTo(x, y + 3*h/4); ctx.lineTo(x + w, y + 3*h/4);
      } else {
        ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.setLineDash([20, 20]);
        ctx.moveTo(x + w/4, y); ctx.lineTo(x + w/4, y + h);
        ctx.moveTo(x + 3*w/4, y); ctx.lineTo(x + 3*w/4, y + h);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Draw grid roads with T-junction logic
    intersections.forEach((node) => {
      const { x, y, blockedDirection, roadNames } = node;
      
      // Draw 4 segments from intersection center
      const segments: Direction[] = ['north', 'south', 'east', 'west'];
      segments.forEach(dir => {
        if (blockedDirection === dir) return;
        
        let sx = x, sy = y, sw = 0, sh = 0;
        if (dir === 'north') { sx = x - roadWidth/2; sy = y - height/2; sw = roadWidth; sh = height/2; }
        if (dir === 'south') { sx = x - roadWidth/2; sy = y; sw = roadWidth; sh = height/2; }
        if (dir === 'east') { sx = x; sy = y - roadWidth/2; sw = width/2; sh = roadWidth; }
        if (dir === 'west') { sx = x - width/2; sy = y - roadWidth/2; sw = width/2; sh = roadWidth; }
        
        drawRoadSegment(sx, sy, sw, sh, dir === 'east' || dir === 'west', roadNames.horizontal);
      });
    });

    // --- Intersections and Signals ---
    intersections.forEach(node => {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const zDist = 85; 
      const zW = 8;
      const zH = 30;
      
      const directions: Direction[] = ['north', 'south', 'east', 'west'];
      directions.forEach(dir => {
        if (node.blockedDirection === dir) return;
        
        // Draw zebra crossings
        for(let i = -roadWidth/2 + 8; i < roadWidth/2; i += 16) {
          if (dir === 'north') ctx.fillRect(node.x + i, node.y - zDist, zW, zH);
          if (dir === 'south') ctx.fillRect(node.x + i, node.y + zDist - zH, zW, zH);
          if (dir === 'west') ctx.fillRect(node.x - zDist, node.y + i, zH, zW);
          if (dir === 'east') ctx.fillRect(node.x + zDist - zH, node.y + i, zH, zW);
        }

        // Draw signal posts
        const dx = dir === 'north' ? -85 : dir === 'south' ? 85 : dir === 'west' ? -110 : 110;
        const dy = dir === 'north' ? -110 : dir === 'south' ? 110 : dir === 'west' ? 85 : -85;
        const state = node.signals[dir];

        const boxW = 20, boxH = 50;
        const lights = [
          { color: '#f43f5e', active: state === 'red' },
          { color: '#fbbf24', active: state === 'yellow' },
          { color: '#10b981', active: state === 'green' }
        ];

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(node.x + dx - boxW/2, node.y + dy - boxH/2, boxW, boxH, 5);
        ctx.fill();
        ctx.strokeStyle = node.manualOverride ? '#fbbf24' : '#334155';
        ctx.lineWidth = node.manualOverride ? 2 : 1;
        ctx.stroke();

        lights.forEach((l, i) => {
          const ly = (node.y + dy - boxH/2) + 10 + (i * 15);
          const lx = node.x + dx;
          if (l.active) {
            ctx.shadowBlur = 20; ctx.shadowColor = l.color; ctx.fillStyle = l.color;
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
          }
          ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0;
        });
      });

      if (node.manualOverride) {
        ctx.strokeStyle = '#fbbf24'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(node.x, node.y, 65, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 8px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.fillText("MANUAL", node.x, node.y + 5);
      }
    });

    vehicles.forEach(v => {
      ctx.save();
      ctx.translate(v.x, v.y);
      let angle = 0;
      if (v.direction === 'east') angle = 0;
      else if (v.direction === 'west') angle = Math.PI;
      else if (v.direction === 'north') angle = -Math.PI / 2;
      else if (v.direction === 'south') angle = Math.PI / 2;
      ctx.rotate(angle);

      ctx.fillStyle = v.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.2;
      const scale = 1.1;

      switch(v.type) {
        case 'bus': ctx.beginPath(); ctx.roundRect(-26*scale, -13*scale, 52*scale, 26*scale, 3); ctx.fill(); ctx.stroke(); break;
        case 'bike': ctx.beginPath(); ctx.roundRect(-9*scale, -3.5*scale, 18*scale, 7*scale, 2); ctx.fill(); ctx.stroke(); break;
        case 'auto': ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.roundRect(-13*scale, -11*scale, 26*scale, 22*scale, 5); ctx.fill(); ctx.stroke(); break;
        default: ctx.beginPath(); ctx.roundRect(-15*scale, -10*scale, 30*scale, 20*scale, 4); ctx.fill(); ctx.stroke();
      }

      ctx.rotate(-angle); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.fillText(v.type.toUpperCase(), 0, -25);
      ctx.restore();
    });

  }, [intersections, vehicles, pedestrians, width, height]);

  return (
    <div className="relative p-2 bg-slate-900 rounded-[3rem] border-[12px] border-slate-800 shadow-[0_0_120px_rgba(0,0,0,0.85)] overflow-hidden">
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        onClick={handleCanvasClick}
        className="relative z-10 cursor-crosshair" 
      />
    </div>
  );
};

export default SimulationCanvas;
