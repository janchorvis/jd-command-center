import { getHotDealsData } from '@/lib/hot-deals';
import DealListView from '@/components/DealListView';
import FunnelBar from '@/components/FunnelBar';
import CollapsibleSection from '@/components/CollapsibleSection';
import AlertsList from '@/components/AlertsList';
import DroppedBallsList from '@/components/DroppedBallsList';
import StaleContactsList from '@/components/StaleContactsList';
import type { DealListItemData } from '@/components/DealListItem';

export const dynamic = 'force-dynamic';

export default function DealsPage() {
  const data = getHotDealsData();

  const pipelineDeals: DealListItemData[] = data.pipelineDeals.map(d => ({
    id: d.id,
    name: d.name,
    property: d.property,
    status: d.status,
    stage: d.stage,
    nextStep: d.nextStep,
    priority: d.priority,
    timeline: d.timeline ?? [],
    dealType: 'pipeline',
  }));

  const sideDeals: DealListItemData[] = data.sideDeals.map(d => ({
    id: d.id,
    name: d.name,
    property: d.property,
    status: d.status,
    stage: undefined,
    nextStep: d.nextStep,
    priority: d.priority,
    timeline: d.timeline ?? [],
    dealType: 'side',
  }));

  const allDeals = [...pipelineDeals, ...sideDeals];
  const crossRefAlerts = data.crossRefAlerts ?? [];
  const droppedBalls = data.droppedBalls ?? [];
  const staleContacts = data.staleContacts ?? [];
  const funnel = data.funnel ?? {};

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-4 py-6">
      <div className="px-4 mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          Deals{' '}
          <span className="text-gray-400 font-normal text-lg">{allDeals.length}</span>
        </h1>
      </div>

      <DealListView deals={allDeals} />

      {/* Below-the-fold insight sections */}
      <div className="mt-6 px-4 sm:px-0 flex flex-col gap-3">
        <FunnelBar funnel={funnel} />

        <CollapsibleSection title="Alerts" count={crossRefAlerts.length}>
          <AlertsList alerts={crossRefAlerts} />
        </CollapsibleSection>

        <CollapsibleSection title="Dropped Balls" count={droppedBalls.length}>
          <DroppedBallsList items={droppedBalls} />
        </CollapsibleSection>

        <CollapsibleSection title="Stale Contacts" count={staleContacts.length}>
          <StaleContactsList contacts={staleContacts} />
        </CollapsibleSection>
      </div>
    </div>
  );
}
