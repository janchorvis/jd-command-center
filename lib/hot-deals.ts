import { readFileSync } from 'fs';
import { join } from 'path';

export interface TimelineEvent {
  date: string;
  event: string;
  type: 'email' | 'call' | 'meeting' | 'milestone' | 'lead' | 'task';
}

export interface DealAction {
  label: string;
  type: 'email' | 'call' | 'task';
}

export interface PipelineDeal {
  id: string;
  name: string;
  property: string;
  status: string;
  stage: string;
  nextStep: string;
  priority: 'high' | 'medium' | 'low';
  timeline: TimelineEvent[];
  contacts: string[];
  actions: DealAction[];
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
  timeline: TimelineEvent[];
  actions: DealAction[];
}

export interface DroppedBall {
  id: string;
  name: string;
  property: string;
  lastSeen: string;
  note: string;
}

export interface Meeting {
  time: string;
  title: string;
  dealContext: string | null;
}

export interface TodayData {
  date: string;
  greeting: string;
  meetings: Meeting[];
  priorities: string[];
}

export interface StaleContact {
  name: string;
  deal: string;
  daysSinceContact: number;
  lastAction: string;
  urgency: 'high' | 'medium' | 'low';
}

export interface WeeklyDiff {
  weekOf: string;
  advanced: string[];
  newLeads: string[];
  stalled: string[];
  completed: string[];
}

export interface FunnelData {
  [stage: string]: number;
}

export interface BrainDump {
  text: string;
  timestamp: string;
  processed: boolean;
}

export interface HotDealsData {
  lastUpdated: string;
  sourceDoc: string;
  today: TodayData;
  pipelineDeals: PipelineDeal[];
  sideDeals: SideDeal[];
  droppedBalls: DroppedBall[];
  staleContacts: StaleContact[];
  weeklyDiff: WeeklyDiff;
  funnel: FunnelData;
  brainDumps: BrainDump[];
}

export function getHotDealsData(): HotDealsData {
  const filePath = join(process.cwd(), 'data', 'hot-deals.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HotDealsData;
}

export function getAllDeals(data: HotDealsData): (PipelineDeal | SideDeal)[] {
  return [...data.pipelineDeals, ...data.sideDeals];
}

export function getDealById(data: HotDealsData, id: string): PipelineDeal | SideDeal | undefined {
  return getAllDeals(data).find(d => d.id === id);
}
