import { readFileSync } from 'fs';
import { join } from 'path';

export interface PipelineDeal {
  id: string;
  name: string;
  property: string;
  status: string;
  stage: string;
  nextStep: string;
  priority: 'high' | 'medium' | 'low';
}

export interface SideDeal {
  id: string;
  name: string;
  property: string;
  type: 'Land/Development' | 'For Lease' | 'Tenant Rep';
  status: string;
  nextStep: string;
  contacts: string[];
  priority: 'high' | 'medium' | 'low';
  lastUpdate: string;
}

export interface DroppedBall {
  id: string;
  name: string;
  property: string;
  lastSeen: string;
  note: string;
}

export interface HotDealsData {
  lastUpdated: string;
  sourceDoc: string;
  pipelineDeals: PipelineDeal[];
  sideDeals: SideDeal[];
  droppedBalls: DroppedBall[];
}

export function getHotDealsData(): HotDealsData {
  const filePath = join(process.cwd(), 'data', 'hot-deals.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HotDealsData;
}
