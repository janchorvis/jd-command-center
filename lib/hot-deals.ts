// Hot Deals + Side Deals Configuration

// Pipedrive deal IDs that Jacob is actively working
// Update this array to change which deals show as "hot"
export const HOT_DEAL_IDS: number[] = [1, 2, 3];

export interface SideDeal {
  id: string;
  name: string;
  property: string;
  type: 'Land/Development' | 'For Lease' | 'Tenant Rep';
  status: string;
  nextStep: string;
  lastUpdate: string; // ISO date
  contacts: { name: string; role: string }[];
  priority: 'high' | 'medium' | 'low';
}

export const SIDE_DEALS: SideDeal[] = [
  {
    id: 'hopesmiles',
    name: 'HopeSmiles',
    property: '44 Vantage Way, Cool Springs',
    type: 'Tenant Rep',
    status: 'Counter sent at $27/SF + $60-65/SF TI. Waiting on landlord response.',
    nextStep: 'Follow up with Shelby Hall if no response by 3/14',
    lastUpdate: '2026-03-11',
    contacts: [
      { name: 'Amy Harper', role: 'Tenant' },
      { name: 'Shelby Hall', role: 'Landlord Rep @ Foundry Commercial' },
    ],
    priority: 'high',
  },
  {
    id: 'buena-vista',
    name: 'Buena Vista',
    property: '2433 Buena Vista Pike, Nashville',
    type: 'Land/Development',
    status: 'Listed at $10M. Infrastructure confirmed built. Multiple inquiries active.',
    nextStep: 'Install physical for-sale sign, walk site before spring vegetation',
    lastUpdate: '2026-03-11',
    contacts: [
      { name: 'Julie Robbins', role: 'Buyer Inquiry @ TerraVest' },
      { name: 'Michael Dunn', role: 'Buyer Inquiry @ CBRE' },
    ],
    priority: 'high',
  },
  {
    id: 'emerson-hall',
    name: 'Emerson Hall',
    property: '2512 Gallatin Ave, Nashville',
    type: 'For Lease',
    status: 'Active negotiations - Hawkins LOI submitted, Brether group interested',
    nextStep: 'Follow up on Hawkins guarantor financials, call Brether group',
    lastUpdate: '2026-03-09',
    contacts: [
      { name: 'Charles Hawkins', role: 'LOI Prospect' },
      { name: 'Brether group', role: 'Event/Entertainment Prospect' },
    ],
    priority: 'medium',
  },
];
