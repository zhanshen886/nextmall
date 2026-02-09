import '@/styles/globals.css';

import { type Metadata } from 'next';
import { Provider } from './provider';
import { TRPCReactProvider } from '@/trpc/react';

import { helloWorldJob } from '@/trpc/helloWorld'
const SITE_URL = process.env.NEXTAUTH_URL || 'https://yunzhiqiao.site';
const SITE_NAME = '林艳之家';
const DEFAULT_TITLE = process.env.TITLE || '林艳之家';
const DEFAULT_DESCRIPTION =
    '线上超市不仅提供各类日常用品，还有许多你从未发现的惊喜商品等你来探索！';
export async function generateMetadata(): Promise<Metadata> {
    return {
        metadataBase: new URL(SITE_URL),
        title: {
            default: DEFAULT_TITLE,
            template: `%s - ${SITE_NAME}`,
        },
        description: DEFAULT_DESCRIPTION,
        keywords: DEFAULT_DESCRIPTION,
        formatDetection: {
            email: false,
            address: false,
            telephone: false,
        },
    };
}

// 所有任务列表
const JOBS = [helloWorldJob];
// 启动所有任务
const startAllJobs = () => {
  JOBS.forEach(job => {
    if (!job.isActive) {
      job.start();
      console.log(`Job started: ${job.name}`);
    }
  });
};
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    startAllJobs()
    return (
        <html lang="zh">
            <body>
                <Provider>
                    <TRPCReactProvider>{children}</TRPCReactProvider>
                </Provider>
            </body>
        </html>
    );
}
