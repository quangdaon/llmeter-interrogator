import {
  loadYamlModels,
  saveYamlModels,
  loadYamlQuestions,
  loadDataSet,
  saveDataSet,
  buildModels,
  buildQuestions,
  findGaps,
} from './dataset.js';
import { ensureLogos, applyLogosToProviders } from './logos.js';
import { runEvaluations, countGaps } from './evaluate.js';
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
  logger.info('Loading existing dataset...');
  const existing = loadDataSet();
  const models = buildModels(providers);
  const questions = buildQuestions(yamlQuestions, existing);
  const dataset = { ...existing, models, questions };

  // Step 4: Find all gaps
  const allModelIds = models.map((m) => m.id);
  const { total, byModel } = countGaps(questions, allModelIds);

  if (total === 0) {
    logger.success('All models have answered all questions. Nothing to do!');
  } else {
    logger.info(`Found ${total} gap(s) across ${allModelIds.length} model(s):`);
    for (const [modelId, count] of Object.entries(byModel)) {
      if (count > 0) logger.info(`  ${modelId}: ${count} missing`);
    }
  }

  // Step 5: Evaluate gaps
  const tasks = findGaps(questions, models);
  await runEvaluations(dataset, tasks);

  // Step 6: Save results
  logger.info('Saving dataset to webapp...');
  saveDataSet(dataset);
  logger.success(`Dataset written with ${questions.length} question(s), ${models.length} model(s)`);

  // Print final summary
  const { total: remaining } = countGaps(dataset.questions, allModelIds);
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
