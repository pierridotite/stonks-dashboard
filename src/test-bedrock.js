#!/usr/bin/env node
/**
 * AWS Bedrock - Test des modèles disponibles
 * Usage: node src/test-bedrock.js
 */

import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// --- Configuration ---
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
// BEDROCK_API_KEY prend la priorité sur AWS_ACCESS_KEY_ID (qui peut valoir "proxy-injected")
const AWS_ACCESS_KEY_ID =
  process.env.BEDROCK_API_KEY || process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY =
  process.env.BEDROCK_API_SECRET || process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error(
    "Erreur : Veuillez définir BEDROCK_API_KEY et BEDROCK_API_SECRET (ou AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)"
  );
  process.exit(1);
}

const credentials = {
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
};

const bedrockClient = new BedrockClient({ region: AWS_REGION, credentials });
const runtimeClient = new BedrockRuntimeClient({ region: AWS_REGION, credentials });

// --- Helpers ---
function separator(title) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  if (title) console.log(`  ${title}`);
  console.log(line);
}

// --- 1. Lister les modèles disponibles ---
async function listModels() {
  separator("1. MODÈLES DISPONIBLES (Foundation Models)");

  const command = new ListFoundationModelsCommand({});
  const response = await bedrockClient.send(command);
  const models = response.modelSummaries || [];

  console.log(`\nTotal : ${models.length} modèles trouvés\n`);

  // Regrouper par provider
  const byProvider = {};
  for (const m of models) {
    const p = m.providerName || "Inconnu";
    if (!byProvider[p]) byProvider[p] = [];
    byProvider[p].push(m);
  }

  for (const [provider, list] of Object.entries(byProvider)) {
    console.log(`\n  [${provider}]`);
    for (const m of list) {
      const modes = (m.inferenceTypesSupported || []).join(", ");
      const status = m.modelLifecycle?.status || "N/A";
      console.log(`    • ${m.modelId}`);
      console.log(`      Nom      : ${m.modelName}`);
      console.log(`      Modes    : ${modes}`);
      console.log(`      Statut   : ${status}`);
    }
  }

  return models;
}

// --- 2. Tester l'invocation d'un modèle ---
async function invokeModel(modelId, prompt) {
  separator(`2. TEST D'INVOCATION : ${modelId}`);

  // Construire le body selon le provider
  let body;
  const provider = modelId.split(".")[0];

  if (provider === "anthropic") {
    body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
  } else if (provider === "amazon") {
    body = JSON.stringify({
      inputText: prompt,
      textGenerationConfig: { maxTokenCount: 200, temperature: 0.7 },
    });
  } else if (provider === "meta") {
    body = JSON.stringify({
      prompt,
      max_gen_len: 200,
      temperature: 0.7,
    });
  } else if (provider === "mistral") {
    body = JSON.stringify({
      prompt,
      max_tokens: 200,
      temperature: 0.7,
    });
  } else if (provider === "cohere") {
    body = JSON.stringify({ prompt, max_tokens: 200 });
  } else if (provider === "ai21") {
    body = JSON.stringify({ prompt, maxTokens: 200 });
  } else {
    body = JSON.stringify({ prompt, max_tokens: 200 });
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  });

  const response = await runtimeClient.send(command);
  const raw = JSON.parse(Buffer.from(response.body).toString("utf-8"));

  // Extraire le texte généré selon le format de réponse
  let text = "Réponse reçue (format inconnu)";
  if (raw.content?.[0]?.text) text = raw.content[0].text;           // Anthropic
  else if (raw.results?.[0]?.outputText) text = raw.results[0].outputText; // Amazon Titan
  else if (raw.generation) text = raw.generation;                    // Meta Llama
  else if (raw.outputs?.[0]?.text) text = raw.outputs[0].text;      // Mistral
  else if (raw.generations?.[0]?.text) text = raw.generations[0].text; // Cohere
  else if (raw.completions?.[0]?.data?.text) text = raw.completions[0].data.text; // AI21
  else text = JSON.stringify(raw, null, 2);

  console.log(`\nPrompt  : "${prompt}"`);
  console.log(`\nRéponse :\n${text.trim()}`);
  return text;
}

// --- 3. Benchmark rapide sur plusieurs modèles ---
async function quickBenchmark(candidateModelIds, prompt) {
  separator("3. BENCHMARK RAPIDE");
  console.log(`\nPrompt  : "${prompt}"\n`);

  const results = [];
  for (const modelId of candidateModelIds) {
    process.stdout.write(`  → Test ${modelId} ... `);
    const start = Date.now();
    try {
      await invokeModelSilent(modelId, prompt);
      const ms = Date.now() - start;
      console.log(`OK (${ms} ms)`);
      results.push({ modelId, status: "OK", ms });
    } catch (err) {
      console.log(`ERREUR : ${err.message}`);
      results.push({ modelId, status: "ERREUR", error: err.message });
    }
  }

  separator("RÉSUMÉ BENCHMARK");
  for (const r of results) {
    const label = r.status === "OK" ? `✓  ${r.ms} ms` : `✗  ${r.error}`;
    console.log(`  ${r.status === "OK" ? "✓" : "✗"}  ${r.modelId.padEnd(55)} ${r.status === "OK" ? r.ms + " ms" : r.error}`);
  }
}

async function invokeModelSilent(modelId, prompt) {
  const provider = modelId.split(".")[0];
  let body;
  if (provider === "anthropic") {
    body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 50,
      messages: [{ role: "user", content: prompt }],
    });
  } else if (provider === "amazon") {
    body = JSON.stringify({
      inputText: prompt,
      textGenerationConfig: { maxTokenCount: 50, temperature: 0.7 },
    });
  } else if (provider === "meta") {
    body = JSON.stringify({ prompt, max_gen_len: 50, temperature: 0.7 });
  } else if (provider === "mistral") {
    body = JSON.stringify({ prompt, max_tokens: 50, temperature: 0.7 });
  } else {
    body = JSON.stringify({ prompt, max_tokens: 50 });
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  });
  await runtimeClient.send(command);
}

// --- MAIN ---
async function main() {
  console.log("\n🔍  AWS BEDROCK — TEST DES MODÈLES");
  console.log(`    Région  : ${AWS_REGION}`);
  console.log(`    Clé     : ${AWS_ACCESS_KEY_ID.slice(0, 8)}...`);

  try {
    // 1. Lister tous les modèles
    const models = await listModels();

    // 2. Tester un modèle spécifique (Anthropic Claude Haiku, rapide et peu coûteux)
    const testModelId =
      process.env.TEST_MODEL_ID ||
      "anthropic.claude-3-haiku-20240307-v1:0";

    const testPrompt =
      process.env.TEST_PROMPT ||
      "Réponds en une phrase : qu'est-ce que AWS Bedrock ?";

    try {
      await invokeModel(testModelId, testPrompt);
    } catch (err) {
      console.log(`\n⚠  Invocation échouée pour ${testModelId} : ${err.message}`);
      console.log(
        "   → Vérifiez que le modèle est activé dans la console Bedrock."
      );
    }

    // 3. Benchmark sur les modèles On-Demand disponibles (filtrés)
    const onDemand = models
      .filter(
        (m) =>
          m.inferenceTypesSupported?.includes("ON_DEMAND") &&
          m.modelLifecycle?.status === "ACTIVE"
      )
      .slice(0, 5) // limiter à 5 pour le test
      .map((m) => m.modelId);

    if (onDemand.length > 0) {
      await quickBenchmark(onDemand, "Dis bonjour en une phrase.");
    }

    separator("TERMINÉ");
    console.log("\n✅  Tous les tests sont terminés.\n");
  } catch (err) {
    console.error(`\n❌  Erreur critique : ${err.message}`);
    if (err.name === "UnrecognizedClientException") {
      console.error("   → Clé API invalide ou non autorisée.");
    } else if (err.name === "AccessDeniedException") {
      console.error("   → Permissions insuffisantes. Vérifiez la politique IAM.");
    }
    process.exit(1);
  }
}

main();
