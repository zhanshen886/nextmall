import { Suspense } from 'react';
import CategoryPageClient from './CategoryPageClient';
import { ContentLoading } from '@/app/_components/LoadingSpinner';

export default function CategoryPage() {
    return (
        <Suspense
            fallback={<ContentLoading text="分类页加载中..." />}
        >
            <CategoryPageClient />
        </Suspense>
    );
}
