import { redirect } from 'next/navigation';

/** The AI setup now lives in Finish setup. */
export default function SetupPage() {
  redirect('/finish-setup');
}
