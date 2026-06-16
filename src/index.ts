import {
  loadYamlModels,
  saveYamlModels,
  loadYamlQuestions,
  loadDataSet,
  saveDataSet,
  buildModels,
  expandModels,
  buildQuestions,
  findGaps,
} from './dataset.js';
import { ensureLogos, applyLogosToProviders } from './logos.js';
import { runEvaluations } from './evaluate.js';
import { logger } from './logger.js';

async function main() {
  console.log('\n\x1b[1m🤖 LLMeter Interrogator\x1b[0m\n');

  // Step 1: Load YAML sources
  logger.info('Loading YAML data sources...');
  let providers = loadYamlModels();
  const yamlQuestions = loadYamlQuestions();
  logger.info(`Found ${providers.length} provider(s), ${yamlQuestions.length} question(s)`);

  // Step 2: Download logos and annotate models
  logger.info('Ensuring model logos...');
  await ensureLogos(providers);
  providers = applyLogosToProviders(providers);
  saveYamlModels(providers);
  logger.info('models.yml updated with logo paths');

  // Step 3: Build the working dataset
  // rootModels drives gap-finding (predecessor-aware); expandedModels goes into questions.json
  logger.info('Loading existing dataset...');
  const existing = loadDataSet();
  const rootModels = buildModels(providers);
  const expandedModels = expandModels(rootModels);
  const questions = buildQuestions(yamlQuestions, existing);
  const dataset = { ...existing, models: expandedModels, questions };

  // Step 4: Find all gaps (predecessor responses count as covered)
  const tasks = findGaps(questions, rootModels, yamlQuestions);

  if (tasks.length === 0) {
    logger.success('All models have answered all questions. Nothing to do!');
  } else {
    const byModel: Record<string, number> = {};
    for (const task of tasks) {
      byModel[task.modelId] = (byModel[task.modelId] ?? 0) + 1;
    }
    logger.info(`Found ${tasks.length} gap(s) across ${rootModels.length} model(s):`);
    for (const [modelId, count] of Object.entries(byModel)) {
      logger.info(`  ${modelId}: ${count} missing`);
    }
  }

  // Step 5: Evaluate gaps — results are written to disk as they arrive
  await runEvaluations(dataset, tasks, saveDataSet);

  // Step 6: Final save — persists model metadata and updates generatedAt
  saveDataSet(dataset);
  logger.success(
    `Dataset written with ${questions.length} question(s), ${expandedModels.length} model(s)`
  );

  // Print final summary
  const remaining = findGaps(dataset.questions, rootModels).length;
  if (remaining > 0) {
    logger.warn(
      `${remaining} gap(s) remain (skipped providers or failed calls). Run again to retry.`
    );
  } else {
    logger.success('Dataset is complete! All models have answered all questions.');
  }

  console.log('\n\x1b[1mDone.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err);
  process.exit(1);
});
