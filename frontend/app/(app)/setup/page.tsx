'use client';
import { useState } from 'react';
import { InterviewPanel } from '@/components/setup/interview-panel';
import { ImportPanel } from '@/components/setup/import-panel';
import { PracticePanel } from '@/components/setup/practice-panel';
import { useAiAvailable } from '@/components/setup/use-ai';
import { ErrorNote, PageHeader, Tabs } from '@/components/ui';
import { useMe } from '@/lib/api';

type Tab = 'import' | 'interview' | 'practice';

export default function SetupPage() {
  const { available } = useAiAvailable();
  const me = useMe();
  const [tab, setTab] = useState<Tab>('import');
  const owner = me.data?.role === 'owner';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="AI setup" description="Not sure what to type? Paste a price list, answer a few questions, then test your assistant. Nothing is saved until you approve it." />
      {!available && <div className="mb-4"><ErrorNote>AI setup help is not switched on for this service yet. You can still set everything up by hand.</ErrorNote></div>}
      {me.data && !owner && <div className="mb-4"><ErrorNote>Only the business owner can use AI setup.</ErrorNote></div>}
      <div className="mb-5"><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'import', label: 'Import a list' }, { id: 'interview', label: 'Answer questions' }, { id: 'practice', label: 'Test your assistant' }]} /></div>
      {tab === 'import' && <ImportPanel />}
      {tab === 'interview' && <InterviewPanel />}
      {tab === 'practice' && <PracticePanel />}
    </div>
  );
}
