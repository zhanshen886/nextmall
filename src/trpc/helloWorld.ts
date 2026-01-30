import { CronJob } from 'cron';
 
export const helloWorldJob = new CronJob(
  // '* * * * * *', // 每秒执行
  '0 */1 * * * *', // 每1分钟执行
  () => {
    console.log('Hello from node-cron! Current time:', new Date().toISOString());
  },
  null,
  false, // 不立即启动
  'Asia/Shanghai' // 时区设置
);