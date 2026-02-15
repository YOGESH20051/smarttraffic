
export type Direction = 'north' | 'south' | 'east' | 'west';
export type VehicleType = 'car' | 'bike' | 'bus' | 'auto' | 'ambulance' | 'police';
export type JunctionType = 'cross' | 't-junction';

export interface LocationConfig {
  name: string;
  lat: number;
  lng: number;
  description: string;
}

export interface Intersection {
  id: string;
  x: number;
  y: number;
  type: JunctionType;
  blockedDirection?: Direction; // The side where there is no road
  signals: Record<Direction, SignalState>;
  queueLengths: Record<Direction, number>;
  throughput: number;
  manualOverride?: boolean;
  roadNames: {
    horizontal: string;
    vertical: string;
  };
}

export type SignalState = 'green' | 'yellow' | 'red';

export interface Vehicle {
  id: string;
  type: VehicleType;
  plateNumber: string;
  x: number;
  y: number;
  targetIntersectionId: string | null;
  lastIntersectionId: string | null; // Prevent turning multiple times at same node
  direction: Direction;
  speed: number;
  baseSpeed: number;
  state: 'moving' | 'waiting' | 'crashed' | 'responding' | 'at_scene' | 'loading' | 'leaving' | 'ready';
  isViolating: boolean;
  color: string;
  laneOffset: number;
  destinationX?: number;
  destinationY?: number;
  aggression: number;
  rescueTimer?: number;
}

export interface Pedestrian {
  id: string;
  x: number;
  y: number;
  direction: 'horizontal' | 'vertical' | 'rescue';
  targetX: number;
  targetY: number;
  state: 'walking' | 'waiting' | 'finished';
  speed: number;
  color: string;
}

export interface Fine {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  time: string;
  violation: string;
  amount: number;
  location: string;
}

export interface SimulationStats {
  averageWaitTime: number;
  totalThroughput: number;
  activeVehicles: number;
  congestionLevel: number;
  history: {
    time: string;
    throughput: number;
    waitTime: number;
  }[];
}

export enum AlgorithmMode {
  STATIC = 'Static (Fixed Time)',
  ADAPTIVE = 'Adaptive (AI-Driven)',
  MANUAL = 'Manual Override',
}
