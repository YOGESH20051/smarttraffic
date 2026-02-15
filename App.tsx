
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { 
  Activity, Settings, BarChart3, BrainCircuit, Play, Pause, 
  AlertTriangle, ChevronRight, Cpu, Terminal, LogOut, Zap, 
  Camera, FileText, MapPin, ExternalLink, Navigation,
  Bike, Bus, Car, Info, Target, Siren, Users, Map as MapIcon, Hand, RefreshCw,
  ArrowUpNarrowWide, ArrowRightLeft
} from 'lucide-react';
import { Intersection, Vehicle, SimulationStats, AlgorithmMode, Direction, Fine, VehicleType, Pedestrian, LocationConfig, SignalState, JunctionType } from './types';
import SimulationCanvas from './components/SimulationCanvas';
import { getTrafficInsights, AiAuditResponse } from './services/geminiService';

const GRID_SIZE = 3;
const WIDTH = 800;
const HEIGHT = 600;
const SAFE_GAP = 75;
const STOP_LINE_DISTANCE = 115; // Far edge of zebra crossing
const TURN_THRESHOLD = 15; // Distance to center to trigger a turn decision

const ROAD_NAMES_POOL = [
  "Anna Salai", "Mount Road", "GST Road", "OMR", "ECR", 
  "Avinashi Road", "Race Course", "Vanjimalai", "Perur Main Road",
  "Netaji Road", "Kamrajar Salai", "Goripalayam Jct", "Theni Road",
  "Chatram Road", "Tanjore Road", "Karur Bypass", "Woraiyur"
];

const LOCATIONS: LocationConfig[] = [
  { name: 'Chennai (Anna Salai)', lat: 13.0405, lng: 80.2337, description: 'Major arterial road with extreme bus and corporate traffic.' },
  { name: 'Coimbatore (Gandhipuram)', lat: 11.0168, lng: 76.9558, description: 'High shopping hub density with massive two-wheeler volume.' },
  { name: 'Madurai (Goripalayam)', lat: 9.9252, lng: 78.1198, description: 'Dense temple city junctions with high pedestrian and auto-rickshaw flow.' },
  { name: 'Trichy (Chatram)', lat: 10.8214, lng: 78.6923, description: 'Strategic river crossing bridge with mixed interstate heavy transit.' }
];

const VEHICLE_CONFIGS: Record<VehicleType, { speedRange: [number, number], color: string, fine: number }> = {
  bike: { speedRange: [4.0, 5.5], color: '#22d3ee', fine: 500 },
  car: { speedRange: [3.2, 4.5], color: '#f8fafc', fine: 1000 },
  auto: { speedRange: [2.5, 3.8], color: '#facc15', fine: 800 },
  bus: { speedRange: [1.8, 2.8], color: '#10b981', fine: 2500 },
  ambulance: { speedRange: [5.5, 7.0], color: '#fff', fine: 0 },
  police: { speedRange: [6.0, 7.5], color: '#1e3a8a', fine: 0 }
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationConfig>(LOCATIONS[0]);
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<SimulationStats>({
    averageWaitTime: 0, totalThroughput: 0, activeVehicles: 0, congestionLevel: 0, history: []
  });
  const [mode, setMode] = useState<AlgorithmMode>(AlgorithmMode.ADAPTIVE);
  const [isRunning, setIsRunning] = useState(true);
  const [logs, setLogs] = useState<string[]>(["[SYS] TN-POLICE OS v16.4 online.", "[CFG] Signal cycle set to 30s (15s per direction)."]);

  useEffect(() => {
    const newInts: Intersection[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const isT = Math.random() < 0.4;
        const blockedDir: Direction | undefined = isT ? (['north', 'south', 'east', 'west'][Math.floor(Math.random() * 4)] as Direction) : undefined;
        
        newInts.push({
          id: `NODE_${r}${c}`,
          x: (WIDTH / (GRID_SIZE + 1)) * (c + 1),
          y: (HEIGHT / (GRID_SIZE + 1)) * (r + 1),
          type: isT ? 't-junction' : 'cross',
          blockedDirection: blockedDir,
          signals: { north: 'red', south: 'red', east: 'green', west: 'green' },
          queueLengths: { north: 0, south: 0, east: 0, west: 0 },
          throughput: 0,
          manualOverride: false,
          roadNames: {
            horizontal: ROAD_NAMES_POOL[Math.floor(Math.random() * ROAD_NAMES_POOL.length)],
            vertical: ROAD_NAMES_POOL[Math.floor(Math.random() * ROAD_NAMES_POOL.length)]
          }
        });
      }
    }
    setIntersections(newInts);
  }, [currentLocation]);

  const spawnVehicle = useCallback((typeOverride?: VehicleType, x?: number, y?: number, dir?: Direction): Vehicle => {
    const directions: Direction[] = ['north', 'south', 'east', 'west'];
    const side = dir || directions[Math.floor(Math.random() * 4)];
    const rowCol = Math.floor(Math.random() * GRID_SIZE);
    const laneOffset = 32; 
    let startX = x ?? 0;
    let startY = y ?? 0;

    if (x === undefined && y === undefined) {
      if (side === 'north') { startX = (WIDTH / (GRID_SIZE + 1)) * (rowCol + 1) + laneOffset; startY = -50; }
      else if (side === 'south') { startX = (WIDTH / (GRID_SIZE + 1)) * (rowCol + 1) - laneOffset; startY = HEIGHT + 50; }
      else if (side === 'west') { startX = -50; startY = (HEIGHT / (GRID_SIZE + 1)) * (rowCol + 1) - laneOffset; }
      else { startX = WIDTH + 50; startY = (HEIGHT / (GRID_SIZE + 1)) * (rowCol + 1) + laneOffset; }
    }

    const type = typeOverride || (['car', 'car', 'bike', 'bike', 'auto', 'bus'][Math.floor(Math.random() * 6)] as VehicleType);
    const config = VEHICLE_CONFIGS[type];
    return {
      id: Math.random().toString(36).substr(2, 9),
      type,
      plateNumber: `TN-${Math.floor(10+Math.random()*89)}${String.fromCharCode(65+Math.random()*25)}-${Math.floor(1000+Math.random()*8999)}`,
      x: startX, y: startY,
      direction: side === 'north' ? 'south' : side === 'south' ? 'north' : side === 'west' ? 'east' : 'west',
      speed: 0,
      baseSpeed: config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0]),
      targetIntersectionId: null,
      lastIntersectionId: null,
      state: 'moving',
      isViolating: false,
      color: config.color,
      laneOffset,
      aggression: Math.random()
    };
  }, []);

  const setManualSignal = useCallback((id: string, axis: 'vertical' | 'horizontal') => {
    setIntersections(prev => prev.map(int => {
      if (int.id !== id) return int;
      const signals: Record<Direction, SignalState> = axis === 'vertical' 
        ? { north: 'green', south: 'green', east: 'red', west: 'red' }
        : { north: 'red', south: 'red', east: 'green', west: 'green' };
      if (int.blockedDirection) signals[int.blockedDirection] = 'red';
      return { ...int, manualOverride: true, signals };
    }));
  }, []);

  const releaseManual = useCallback((id: string) => {
    setIntersections(prev => prev.map(int => {
      if (int.id !== id) return int;
      return { ...int, manualOverride: false };
    }));
  }, []);

  const updateSimulation = useCallback(() => {
    if (!isRunning) return;

    // SIGNAL LOGIC
    setIntersections(prev => prev.map(node => {
      if (node.manualOverride) return node;

      const nq = vehicles.filter(v => v.direction === 'south' && v.y < node.y - STOP_LINE_DISTANCE && v.y > node.y - STOP_LINE_DISTANCE - 150).length;
      const sq = vehicles.filter(v => v.direction === 'north' && v.y > node.y + STOP_LINE_DISTANCE && v.y < node.y + STOP_LINE_DISTANCE + 150).length;
      const eq = vehicles.filter(v => v.direction === 'west' && v.x > node.x + STOP_LINE_DISTANCE && v.x < node.x + STOP_LINE_DISTANCE + 150).length;
      const wq = vehicles.filter(v => v.direction === 'east' && v.x < node.x - STOP_LINE_DISTANCE && v.x > node.x - STOP_LINE_DISTANCE - 150).length;
      
      const vQ = nq + sq;
      const hQ = eq + wq;

      let signals = { ...node.signals };
      // User request: 15 sec for each signal change. 
      // Total cycle = 30s. Direction 1 (15s), Direction 2 (15s).
      const cycle = 30000;
      const phase = (Date.now() % cycle) / cycle;

      if (mode === AlgorithmMode.ADAPTIVE) {
        if (vQ > hQ + 3) signals = { north: 'green', south: 'green', east: 'red', west: 'red' };
        else if (hQ > vQ + 3) signals = { north: 'red', south: 'red', east: 'green', west: 'green' };
        else {
          // Standard rotation with 15s phases
          if (phase < 0.45) signals = { north: 'red', south: 'red', east: 'green', west: 'green' }; // ~13.5s green
          else if (phase < 0.5) signals = { north: 'red', south: 'red', east: 'yellow', west: 'yellow' }; // ~1.5s yellow
          else if (phase < 0.95) signals = { north: 'green', south: 'green', east: 'red', west: 'red' }; // ~13.5s green
          else signals = { north: 'yellow', south: 'yellow', east: 'red', west: 'red' }; // ~1.5s yellow
        }
      } else {
        if (phase < 0.45) signals = { north: 'red', south: 'red', east: 'green', west: 'green' };
        else if (phase < 0.5) signals = { north: 'red', south: 'red', east: 'yellow', west: 'yellow' };
        else if (phase < 0.95) signals = { north: 'green', south: 'green', east: 'red', west: 'red' };
        else signals = { north: 'yellow', south: 'yellow', east: 'red', west: 'red' };
      }

      if (node.blockedDirection) signals[node.blockedDirection] = 'red';
      return { ...node, signals, queueLengths: { north: nq, south: sq, east: eq, west: wq } };
    }));

    // VEHICLE LOGIC
    setVehicles(prev => {
      let updated = prev.map((v, i) => {
        if (v.state === 'crashed') return v;
        let { x, y, direction, speed, state, baseSpeed, laneOffset, lastIntersectionId } = v;

        const nearestInt = intersections.find(int => {
          if (int.blockedDirection === direction) return false;
          if (direction === 'east') return x < int.x && Math.abs(int.y - y) < 65;
          if (direction === 'west') return x > int.x && Math.abs(int.y - y) < 65;
          if (direction === 'north') return y > int.y && Math.abs(int.x - x) < 65;
          if (direction === 'south') return y < int.y && Math.abs(int.x - x) < 65;
          return false;
        });

        let targetSpeed = baseSpeed;

        if (nearestInt) {
          const sig = nearestInt.signals[direction];
          let distToInt = 0;
          if (direction === 'east') distToInt = nearestInt.x - x;
          else if (direction === 'west') distToInt = x - nearestInt.x;
          else if (direction === 'north') distToInt = y - nearestInt.y;
          else if (direction === 'south') distToInt = nearestInt.y - y;

          // STOP LOGIC - AVOID OVER-CROSSING ZEBRA
          if (sig === 'red' || sig === 'yellow') {
            if (distToInt >= STOP_LINE_DISTANCE) {
              const gapToLine = distToInt - STOP_LINE_DISTANCE;
              if (gapToLine < 3) {
                targetSpeed = 0;
                state = 'waiting';
              } else if (gapToLine < 60) {
                targetSpeed = Math.min(baseSpeed, (gapToLine / 60) * baseSpeed);
                state = 'waiting';
              } else {
                targetSpeed = baseSpeed * 0.7;
                state = 'moving';
              }
            } else {
              targetSpeed = baseSpeed;
              state = 'moving';
            }
          } else {
            targetSpeed = baseSpeed;
            state = 'moving';
          }

          // TURNING LOGIC
          if (distToInt < TURN_THRESHOLD && lastIntersectionId !== nearestInt.id) {
            const possibleExits: Direction[] = [];
            const opposite: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
            const exits: Direction[] = ['north', 'south', 'east', 'west'];
            
            exits.forEach(dir => {
              if (dir !== opposite[direction] && nearestInt.blockedDirection !== dir) {
                possibleExits.push(dir);
              }
            });

            if (possibleExits.length > 0) {
              const rand = Math.random();
              let nextDir = direction;
              if (possibleExits.includes(direction) && rand < 0.7) nextDir = direction;
              else nextDir = possibleExits[Math.floor(Math.random() * possibleExits.length)];

              if (nextDir !== direction) {
                direction = nextDir;
                const offset = 32; 
                if (direction === 'north') { x = nearestInt.x - offset; y = nearestInt.y; }
                else if (direction === 'south') { x = nearestInt.x + offset; y = nearestInt.y; }
                else if (direction === 'east') { x = nearestInt.x; y = nearestInt.y + offset; }
                else if (direction === 'west') { x = nearestInt.x; y = nearestInt.y - offset; }
                lastIntersectionId = nearestInt.id;
              }
            }
          }
        }

        const front = prev.find((o, j) => {
          if (i === j) return false;
          if (o.direction !== direction) return false;
          if (Math.abs(o.laneOffset - laneOffset) > 5) return false;
          let dist = 0;
          if (direction === 'east') dist = o.x - x;
          else if (direction === 'west') dist = x - o.x;
          else if (direction === 'north') dist = y - o.y;
          else if (direction === 'south') dist = o.y - y;
          return dist > 0 && dist < SAFE_GAP;
        });

        if (front) {
          targetSpeed = Math.min(targetSpeed, front.speed * 0.9);
          if (targetSpeed < 0.2) targetSpeed = 0;
        }

        const accel = 0.2;
        const decel = 0.5;
        if (speed < targetSpeed) speed = Math.min(speed + accel, targetSpeed);
        else if (speed > targetSpeed) speed = Math.max(speed - decel, targetSpeed);

        if (speed > 0.1) {
          if (direction === 'east') x += speed;
          else if (direction === 'west') x -= speed;
          else if (direction === 'north') y -= speed;
          else if (direction === 'south') y += speed;
        }

        return { ...v, x, y, speed, state, direction, lastIntersectionId };
      });

      if (updated.length < 52 && Math.random() < 0.2) updated.push(spawnVehicle());
      return updated.filter(v => v.x >= -350 && v.x <= WIDTH + 350 && v.y >= -350 && v.y <= HEIGHT + 350);
    });

    setStats(prev => ({
      ...prev,
      activeVehicles: vehicles.length,
      congestionLevel: vehicles.filter(v => v.state === 'waiting').length / (vehicles.length || 1),
    }));
  }, [isRunning, mode, intersections, vehicles, spawnVehicle]);

  useEffect(() => {
    if (isRunning) { const interval = setInterval(updateSimulation, 50); return () => clearInterval(interval); }
  }, [isRunning, updateSimulation]);

  const handleCanvasClick = (id: string) => {
    const int = intersections.find(i => i.id === id);
    if (!int) return;
    if (!int.manualOverride) setManualSignal(id, 'vertical');
    else if (int.signals.north === 'green') setManualSignal(id, 'horizontal');
    else releaseManual(id);
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-[#020617] relative">
        <div className="glass w-full max-w-md p-10 rounded-[4rem] border-cyan-500/20 shadow-[0_0_120px_rgba(34,211,238,0.2)] z-10 animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <div className="flex flex-col items-center mb-12">
             <div className="p-8 bg-cyan-600 rounded-full shadow-[0_0_60px_rgba(8,145,178,0.5)] mb-8 animate-float"><Siren className="w-14 h-14 text-white" /></div>
             <h1 className="text-5xl font-black tracking-tighter text-white mb-2 italic uppercase text-center">TAMIL NADU<br/>TRAFFIC HUB</h1>
             <p className="text-cyan-400/50 text-[10px] font-mono tracking-[0.4em] font-bold">SMART_SIGNAL_INTERFACE_v16.4</p>
          </div>
          <button onClick={() => setIsLoggedIn(true)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-6 rounded-2xl shadow-xl transition-all uppercase text-xs tracking-[0.3em]">Initialize Grid</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] text-slate-400 font-sans">
      <header className="h-24 border-b border-white/5 flex items-center justify-between px-12 glass z-30">
        <div className="flex items-center gap-10">
          <div className="flex flex-col">
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic flex items-center gap-3">
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_15px_#22d3ee]" />
              SYNE_PATH <span className="text-cyan-500">IND</span>
            </h1>
            <div className="text-[10px] font-mono text-slate-500 tracking-[0.3em] font-bold uppercase">{currentLocation.name}</div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex gap-6 px-10 border-r border-white/10 h-12 items-center font-mono">
             <div className="flex items-center gap-2" title="Active Vehicles"><Car className="w-4 h-4 text-cyan-500"/><span className="text-lg font-black text-white">{vehicles.length}</span></div>
          </div>
          <button onClick={() => setIsRunning(!isRunning)} className={`px-8 py-4 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all flex items-center gap-3 shadow-xl ${isRunning ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50' : 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50'}`}>
            {isRunning ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5"/>}
          </button>
          <button onClick={() => setIsLoggedIn(false)} className="p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all text-white"><LogOut className="w-6 h-6" /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-96 border-r border-white/5 glass flex flex-col p-8 space-y-10 overflow-y-auto">
           <section>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3 italic"><Settings className="w-5 h-5 text-cyan-500"/> Grid_Mode</h2>
              <div className="grid grid-cols-1 gap-3">
                {[AlgorithmMode.STATIC, AlgorithmMode.ADAPTIVE, AlgorithmMode.MANUAL].map(m => (
                  <button key={m} onClick={() => setMode(m)} className={`w-full p-5 rounded-2xl border transition-all text-left ${mode === m ? 'bg-cyan-600/20 border-cyan-500/50 text-white shadow-[0_0_30px_rgba(34,211,238,0.1)]' : 'bg-white/5 border-transparent text-slate-500 hover:bg-white/10'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest">{m}</div>
                  </button>
                ))}
              </div>
           </section>

           <section className="flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[11px] font-black text-yellow-500 uppercase tracking-widest flex items-center gap-3 italic"><Hand className="w-5 h-5"/> Junction Command</h2>
                </div>
                
                <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                  {intersections.map(int => (
                    <div key={int.id} className={`p-4 rounded-2xl border transition-all ${int.manualOverride ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-[10px] font-black text-white uppercase truncate max-w-[150px]">{int.roadNames.vertical}</div>
                          <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">
                            {int.type === 't-junction' ? `T-Junction (Blocked ${int.blockedDirection?.toUpperCase()})` : `Intersecting ${int.roadNames.horizontal}`}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => setManualSignal(int.id, 'vertical')}
                          className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-all ${int.signals.north === 'green' && int.manualOverride ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}
                        >
                          <ArrowUpNarrowWide className="w-4 h-4" />
                          <span className="text-[7px] font-bold">VERT</span>
                        </button>
                        <button 
                          onClick={() => setManualSignal(int.id, 'horizontal')}
                          className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-all ${int.signals.east === 'green' && int.manualOverride ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          <span className="text-[7px] font-bold">HORIZ</span>
                        </button>
                        <button 
                          onClick={() => releaseManual(int.id)}
                          className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-all ${!int.manualOverride ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-slate-500'}`}
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span className="text-[7px] font-bold">AUTO</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
           </section>

           <section>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3 italic"><Terminal className="w-5 h-5 text-cyan-500"/> System Logs</h2>
              <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                {logs.map((log, i) => (
                  <div key={i} className="font-mono text-[8px] text-slate-500 leading-tight pb-1 border-b border-white/5">{log}</div>
                ))}
              </div>
           </section>
        </aside>

        <section className="flex-1 p-8 overflow-y-auto flex flex-col items-center bg-[#050505]">
          <div className="w-full max-w-5xl">
            <SimulationCanvas 
              intersections={intersections} 
              vehicles={vehicles} 
              pedestrians={[]} 
              width={WIDTH} 
              height={HEIGHT} 
              onIntersectionClick={handleCanvasClick}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
