import { callProvider } from './providers/index.js';
import { isProviderEnabled } from './config.js';
import { logger } from './logger.js';
import type { DataSet, Question, EvaluationTask } from './types.js';

export async function runEvaluations(
  dataset: DataSet,
  tasks: EvaluationTask[]
): Promise<DataSet> {
  if (tasks.length === 0) {
    logger.info('No gaps found — dataset is complete.');
    return dataset;
  }

  logger.info(`Running ${tasks.length} evaluation(s)...`);

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

  const FAILURE_THRESHOLD = 3;

  // Run all provider queues in parallel (but each queue is sequential internally)
  const providerPromises = Array.from(byProvider.entries()).map(
    async ([provider, providerTasks]) => {
      let consecutiveFailures = 0;

      for (const task of providerTasks) {
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          logger.warn(
            `Provider "${provider}" hit ${FAILURE_THRESHOLD} consecutive failures — skipping remaining ${providerTasks.length} task(s) for this session.`
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
            task.question.options
          );

          // Mutate the question in-place (dataset.questions holds references)
          const q = dataset.questions.find((dq) => dq.id === task.question.id);
          if (q) {
            // Remove any existing response for this model (shouldn't happen, but be safe)
            q.responses = q.responses.filter((r) => r.modelId !== task.modelId);
            q.responses.push({
              modelId: result.modelId,
              selection: result.selection,
              reasoning: result.reasoning,
            });
          }

          consecutiveFailures = 0;
          logger.success(`${label} → "${result.selection}"`);
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
  return dataset;
}

export function countGaps(
  questions: Question[],
  modelIds: string[]
): { total: number; byModel: Record<string, number> } {
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const modelId of modelIds) {
    const missing = questions.filter(
      (q) => !q.responses.some((r) => r.modelId === modelId)
    ).length;
    byModel[modelId] = missing;
    total += missing;
  }
  return { total, byModel };
}
