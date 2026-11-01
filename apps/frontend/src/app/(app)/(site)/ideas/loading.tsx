'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export default function LoadingIdeas() { const t = useT(); return <div className="flex-1 bg-newBgColorInner p-8 text-textItemBlur" role="status">{t('ideas_ui.loading')}</div>; }
