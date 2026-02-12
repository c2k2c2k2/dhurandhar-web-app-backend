Below is a **Codex-friendly, copy/paste integration guide** to add **BullMQ** queues in a **NestJS** project using **Redis**, aligned with Nest’s official “Queues → BullMQ” docs. ([NestJS Docs][1])

---

## 0) Prereq: Redis

You need a Redis instance reachable from your Nest app (local, Docker, cloud). BullMQ persists jobs in Redis. ([NestJS Docs][1])

---

## 1) Install dependencies

```bash
npm i @nestjs/bullmq bullmq
```

([NestJS Docs][1])

---

## 2) Add shared BullMQ config (Redis connection)

### Option A — Static config (quick POC)

`src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AudioModule } from './queues/audio/audio.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    AudioModule,
  ],
})
export class AppModule {}
```

This `forRoot()` config is shared by all queues unless overridden per-queue. ([NestJS Docs][1])

### Option B — Async config (recommended for env/config module)

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        connection: {
          host: config.get<string>('QUEUE_HOST'),
          port: config.get<number>('QUEUE_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

([NestJS Docs][1])

---

## 3) Create a Queue module (registerQueue)

Example: `audio` queue

`src/queues/audio/audio.module.ts`

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AudioProducerService } from './audio.producer';
import { AudioConsumer } from './audio.consumer';
import { AudioEventsListener } from './audio.events';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
    }),
  ],
  providers: [AudioProducerService, AudioConsumer, AudioEventsListener],
  exports: [AudioProducerService],
})
export class AudioModule {}
```

- Queue name is the injection token and decorator argument (e.g., `@InjectQueue('audio')`, `@Processor('audio')`). ([NestJS Docs][1])
- Consumers/listeners must be registered as providers. ([NestJS Docs][1])

---

## 4) Producer: enqueue jobs

`src/queues/audio/audio.producer.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AudioProducerService {
  constructor(@InjectQueue('audio') private readonly audioQueue: Queue) {}

  async enqueueTranscode(payload: { foo: string }) {
    // job name: 'transcode'
    return this.audioQueue.add('transcode', payload);
  }

  async enqueueDelayed(payload: any) {
    return this.audioQueue.add('transcode', payload, { delay: 3000 }); // 3s delay
  }

  async enqueuePriority(payload: any) {
    return this.audioQueue.add('transcode', payload, { priority: 2 });
  }
}
```

- `queue.add(name, data, options?)` is the standard way to enqueue jobs. ([NestJS Docs][1])

---

## 5) Consumer (worker): process jobs

BullMQ in Nest uses a `WorkerHost` consumer with a `process()` method.

`src/queues/audio/audio.consumer.ts`

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    // BullMQ does NOT support @Process('name') for named jobs the way Bull did.
    // Use a switch on job.name instead.
    switch (job.name) {
      case 'transcode': {
        // example progress update
        let progress = 0;
        for (let i = 0; i < 100; i++) {
          // doSomething(job.data)
          progress += 1;
          await job.updateProgress(progress);
        }
        return { ok: true };
      }

      default:
        return { ignored: true };
    }
  }
}
```

- `@Processor('audio')` binds this worker to the `audio` queue. ([NestJS Docs][1])
- Named job handlers via `@Process('transcode')` are **not supported** in BullMQ; use `switch(job.name)`. ([NestJS Docs][1])

---

## 6) Event listeners (optional but useful)

### Worker-level events (inside a consumer class)

`src/queues/audio/audio.worker-events.consumer.ts` (or keep inside `AudioConsumer`)

```ts
import { Processor, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioWorkerEventsConsumer {
  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(`Processing job ${job.id} (${job.name})`);
  }
}
```

([NestJS Docs][1])

### QueueEvents (dedicated listener class)

`src/queues/audio/audio.events.ts`

```ts
import {
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';

@QueueEventsListener('audio')
export class AudioEventsListener extends QueueEventsHost {
  @OnQueueEvent('active')
  onActive(job: { jobId: string; prev?: string }) {
    console.log(`Queue event: active job ${job.jobId}`);
  }
}
```

- Must be a provider in the module. ([NestJS Docs][1])

---

## 7) Separate process workers (optional: sandbox CPU-heavy work)

If you want job handlers in a **forked process**, register processors with a file path:

`src/app.module.ts` (example)

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'node:path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
      processors: [join(__dirname, 'processor.js')],
    }),
  ],
})
export class AppModule {}
```

⚠️ DI won’t be available in the forked processor file; it must create its own dependencies. ([NestJS Docs][1])

---

## 8) (Optional) Multiple Redis configs (named configurations)

If some queues use a different Redis instance:

```ts
BullModule.forRoot('alternative-config', {
  connection: { port: 6381 },
});

// later
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});
```

([NestJS Docs][1])

---

## 9) Minimal verification checklist

- [ ] Redis reachable (host/port, auth if used).
- [ ] `BullModule.forRoot(...)` (or `forRootAsync`) in root module. ([NestJS Docs][1])
- [ ] Queue registered with `BullModule.registerQueue({ name })`. ([NestJS Docs][1])
- [ ] Producer injects queue via `@InjectQueue(name)` and calls `queue.add(...)`. ([NestJS Docs][1])
- [ ] Consumer class has `@Processor(name)` and extends `WorkerHost` implementing `process(job)`. ([NestJS Docs][1])
- [ ] If using listeners, they are also providers. ([NestJS Docs][1])

---

If you tell me your NestJS setup (monolith vs microservices, Docker vs local Redis, and whether you want **separate worker process**), I can output a **ready-to-drop folder structure + modules** matching your repo conventions.

[1]: https://docs.nestjs.com/techniques/queues 'Queues | NestJS - A progressive Node.js framework'
