import { Metadata } from 'next';
import { IdeasWorkspace } from '@gitroom/frontend/components/ideas/ideas-workspace';
export const metadata: Metadata = { title: 'Ideias · Postqube' };
export default function IdeasPage() { return <IdeasWorkspace />; }
