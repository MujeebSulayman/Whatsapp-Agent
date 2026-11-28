'use client';
import { ImportPanel } from '@/components/setup/import-panel';
import { PracticePanel } from '@/components/setup/practice-panel';
import { useAiAvailable } from '@/components/setup/use-ai';
import { Notice, PageHeader } from '@/components/ui';
import { useMe } from '@/lib/api';

/* One place: show the assistant what you sell on the left, try it out on the right. */
export default function SetupPage() {
  const { available } = useAiAvailable();
  const me = useMe();
  const owner = me.data?.role === 'owner';
  return (
    <>
      <PageHeader title="AI setup" />
      {!available && <Notice tone="warning" title="AI isn't switched on yet" className="mb-6" />}
      {me.data && !owner && <Notice title="Only the owner can use this" className="mb-6" />}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ImportPanel />
        <div className="lg:sticky lg:top-8"><PracticePanel /></div>
      </div>
    </>
  );
}
