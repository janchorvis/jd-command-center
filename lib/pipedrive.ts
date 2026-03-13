// Pipedrive API Integration

export interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  stage_id: number;
  pipeline_id: number;
  org_name: string | null;
  person_name: string | null;
  update_time: string;
  add_time: string;
  status: string;
}

export interface Deal {
  id: string;
  tenant: string;
  property: string;
  value: number;
  stage: string;
  lastActivity: Date;
  daysInactive: number;
  health: 'active' | 'watch' | 'stale';
}

const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN;
const LEASING_PIPELINE_ID = process.env.PIPEDRIVE_LEASING_PIPELINE_ID;

// Leasing pipeline stage mapping (from TOOLS.md)
const STAGE_NAMES: Record<number, string> = {
  22: 'Contact Made',
  23: 'Touring',
  24: 'Obtain Financials',
  25: 'Trading Terms',
  26: 'LOI',
  28: 'Lease Draft & Review',
  29: 'Stalled',
};

async function pipedriveFetch(endpoint: string) {
  const url = `https://${PIPEDRIVE_DOMAIN}/v1${endpoint}`;
  const separator = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}api_token=${PIPEDRIVE_TOKEN}`);

  if (!response.ok) {
    throw new Error(`Pipedrive API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

function calculateDaysInactive(lastActivity: Date): number {
  const today = new Date();
  const diffMs = today.getTime() - lastActivity.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getDealHealth(daysInactive: number): 'active' | 'watch' | 'stale' {
  if (daysInactive <= 7) return 'active';
  if (daysInactive <= 14) return 'watch';
  return 'stale';
}

function transformDeal(pipedriveDeal: PipedriveDeal): Deal {
  const lastActivity = new Date(pipedriveDeal.update_time);
  const daysInactive = calculateDaysInactive(lastActivity);

  return {
    id: pipedriveDeal.id.toString(),
    tenant: pipedriveDeal.person_name || pipedriveDeal.title,
    property: pipedriveDeal.org_name || 'Unknown',
    value: pipedriveDeal.value,
    stage: STAGE_NAMES[pipedriveDeal.stage_id] || 'Unknown',
    lastActivity,
    daysInactive,
    health: getDealHealth(daysInactive),
  };
}

export async function fetchDeals(): Promise<Deal[]> {
  const deals = await pipedriveFetch(
    `/deals?pipeline_id=${LEASING_PIPELINE_ID}&status=open`
  );

  if (!deals) return [];
  return deals.map(transformDeal);
}

export function groupDealsByStage(deals: Deal[]) {
  const stages = [
    'Contact Made',
    'Touring',
    'Obtain Financials',
    'Trading Terms',
    'LOI',
    'Lease Draft & Review',
    'Stalled',
  ];

  const grouped: Record<string, Deal[]> = {};
  stages.forEach(stage => {
    grouped[stage] = [];
  });

  deals.forEach(deal => {
    if (grouped[deal.stage]) {
      grouped[deal.stage].push(deal);
    }
  });

  return grouped;
}

export function getStaleDeals(deals: Deal[]): Deal[] {
  return deals.filter(d => d.health === 'stale').sort((a, b) => b.daysInactive - a.daysInactive);
}
