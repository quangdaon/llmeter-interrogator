import { callProvider } from './providers/index.js';
import { isProviderEnabled } from './config.js';
import { logger } from './logger.js';
import type { DataSet, EvaluationTask } from './types.js';

// Coalescing writer: if a write is already in progress, incoming requests set a
// dirty flag instead of queuing individually. When the write finishes it checks
// the flag and does exactly one follow-up write covering all accumulated data.
// At most two writes ever run back-to-back, regardless of result volume.
//
// The setImmediate yield after the sync write is what makes coalescing real:
// it holds `writing = true` while returning control to the event loop, so any
// provider results that resolved concurrently can call enqueue, see the flag,
// and mark dirty — rather than each kicking off its own write.
class CoalescingWriter {
  private writing = false;
  private dirty = false;
  private tail: Promise<void> = Promise.resolve();

  enqueue(fn: () => void): void {
    if (this.writing) {
      this.dirty = true;
      return;
    }
    this.tail = this.run(fn);
  }

  private async run(fn: () => void): Promise<void> {
    this.writing = true;
    this.dirty = false;
    fn();
    // Yield to the event loop before checking dirty. Without this, the dirty
    // check is synchronous and no concurrent enqueue can ever set the flag.
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.writing = false;
    if (this.dirty) {
      await this.run(fn);
    }
  }

  drain(): Promise<void> {
    return this.tail;
  }
}

export async function runEvaluations(
  dataset: DataSet,
  tasks: EvaluationTask[],
  save: (dataset: DataSet) => void
): Promise<DataSet> {
  if (tasks.length === 0) {
    logger.info('No gaps found — dataset is complete.');
    return dataset;
  }

  logger.info(`Running ${tasks.length} evaluation(s)...`);

  const writer = new CoalescingWriter();
  const FAILURE_THRESHOLD = 3;

  // Group tasks by provider so each provider runs sequentially
  const byProvider = new Map<string, EvaluationTask[]>();
  for (const task of tasks) {
    const arr = byProvider.get(task.provider) ?? [];
    arr.push(task);
    byProvider.set(task.provider, arr);
  }

  // Skip disabled providers upfront
  for (const [provider, providerTasks] of byProvider) {
    if (!isProviderEnabled(provider)) {
      logger.warn(`Skipping provider "${provider}" — no API key configured.`);
      byProvider.delete(provider);
      continue;
    }
    logger.info(`Provider "${provider}": ${providerTasks.length} task(s) queued`);
  }

  // Run all provider queues in parallel (but each queue is sequential internally)
  const providerPromises = Array.from(byProvider.entries()).map(
    async ([provider, providerTasks]) => {
      let consecutiveFailures = 0;

      for (const task of providerTasks) {
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          logger.warn(
            `Provider "${provider}" hit ${FAILURE_THRESHOLD} consecutive failures — skipping remaining tasks for this session.`
          );
          break;
        }

        const label = `[${provider}/${task.modelId}] "${task.question.text.slice(0, 50)}..."`;
        try {
          logger.info(`Evaluating ${label}`);
          const result = await callProvider(
            provider,
            task.modelId,
            task.question.text,
            task.question.options,
            task.additionalInstructions
          );

          // Mutate the question in-place (dataset.questions holds references)
          const q = dataset.questions.find((dq) => dq.id === task.question.id);
          if (q) {
            q.responses = q.responses.filter((r) => r.modelId !== task.modelId);
            q.responses.push({
              modelId: result.modelId,
              selection: result.selection,
              reasoning: result.reasoning,
            });
          }

          consecutiveFailures = 0;
          logger.success(`${label} → "${result.selection}"`);

          // Persist immediately through the serial writer
          writer.enqueue(() => save(dataset));
        } catch (err) {
          consecutiveFailures++;
          logger.error(
            `Failed ${label} (${consecutiveFailures}/${FAILURE_THRESHOLD} consecutive)`,
            err
          );
        }
      }
    }
  );

  await Promise.all(providerPromises);
  // Wait for any in-flight write to finish before returning
  await writer.drain();
  return dataset;
}

