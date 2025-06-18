#!/usr/bin/env node
import chalk from "chalk";
import { execSync } from "child_process";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for better type safety
type LanguageKey = "typescript" | "python";
type TemplateKey =
  | "sample-app"
  | "browser-use"
  | "stagehand"
  | "advanced-sample"
  | "computer-use"
  | "cua-sample";
type LanguageInfo = { name: string; shorthand: string };
type TemplateInfo = {
  name: string;
  description: string;
  languages: LanguageKey[];
};

// String constants
const LANGUAGE_TYPESCRIPT = "typescript";
const LANGUAGE_PYTHON = "python";
const TEMPLATE_SAMPLE_APP = "sample-app";
const TEMPLATE_BROWSER_USE = "browser-use";
const TEMPLATE_STAGEHAND = "stagehand";
const TEMPLATE_ADVANCED_SAMPLE = "advanced-sample";
const TEMPLATE_COMPUTER_USE = "computer-use";
const TEMPLATE_CUA_SAMPLE = "cua-sample";
const LANGUAGE_SHORTHAND_TS = "ts";
const LANGUAGE_SHORTHAND_PY = "py";

// Configuration constants
const LANGUAGES: Record<LanguageKey, LanguageInfo> = {
  [LANGUAGE_TYPESCRIPT]: {
    name: "TypeScript",
    shorthand: LANGUAGE_SHORTHAND_TS,
  },
  [LANGUAGE_PYTHON]: { name: "Python", shorthand: LANGUAGE_SHORTHAND_PY },
};

const TEMPLATES: Record<TemplateKey, TemplateInfo> = {
  [TEMPLATE_SAMPLE_APP]: {
    name: "Sample App",
    description: "Implements basic Kernel apps",
    languages: [LANGUAGE_TYPESCRIPT, LANGUAGE_PYTHON],
  },
  [TEMPLATE_BROWSER_USE]: {
    name: "Browser Use",
    description: "Implements Browser Use SDK",
    languages: [LANGUAGE_PYTHON],
  },
  [TEMPLATE_STAGEHAND]: {
    name: "Stagehand",
    description: "Implements the Stagehand SDK",
    languages: [LANGUAGE_TYPESCRIPT],
  },
  [TEMPLATE_ADVANCED_SAMPLE]: {
    name: "Advanced Samples",
    description:
      "Implements sample actions with advanced Kernel configs",
    languages: [LANGUAGE_TYPESCRIPT, LANGUAGE_PYTHON],
  },
  [TEMPLATE_COMPUTER_USE]: {
    name: "Computer Use",
    description: "Implements the Anthropic Computer Use SDK",
    languages: [LANGUAGE_TYPESCRIPT, LANGUAGE_PYTHON],
  },
  [TEMPLATE_CUA_SAMPLE]: {
    name: "CUA Sample",
    description: "Implements a Computer Use Agent (OpenAI CUA) sample",
    languages: [LANGUAGE_TYPESCRIPT],
  },
};

const INVOKE_SAMPLES: Record<
  LanguageKey,
  Partial<Record<TemplateKey, string>>
> = {
  [LANGUAGE_TYPESCRIPT]: {
    [TEMPLATE_SAMPLE_APP]:
      'kernel invoke ts-basic get-page-title --payload \'{"url": "https://www.google.com"}\'',
    [TEMPLATE_STAGEHAND]:
      'kernel invoke ts-stagehand stagehand-task --payload \'{"query": "Best wired earbuds"}\'',
    [TEMPLATE_ADVANCED_SAMPLE]:
      'kernel invoke ts-advanced test-captcha-solver',
    [TEMPLATE_COMPUTER_USE]:
      'kernel invoke ts-cu cu-task --payload \'{"query": "Return the first url of a search result for NYC restaurant reviews Pete Wells"}\'',
    [TEMPLATE_CUA_SAMPLE]:
      'kernel invoke ts-cua cua-task --payload \'{"query": "open hackernews and get the top 5 articles"}\'',
  },
  [LANGUAGE_PYTHON]: {
    [TEMPLATE_SAMPLE_APP]:
      'kernel invoke python-basic get-page-title --payload \'{"url": "https://www.google.com"}\'',
    [TEMPLATE_BROWSER_USE]:
      'kernel invoke python-bu bu-task --payload \'{"task": "Compare the price of gpt-4o and DeepSeek-V3"}\'',
    [TEMPLATE_ADVANCED_SAMPLE]:
      'kernel invoke python-advanced test-captcha-solver',
    [TEMPLATE_COMPUTER_USE]:
      'kernel invoke python-cu cu-task --payload \'{"query": "Return the first url of a search result for NYC restaurant reviews Pete Wells"}\'',
  },
};

const REGISTERED_APP_NAMES: Record<
  LanguageKey,
  Partial<Record<TemplateKey, string>>
> = {
  [LANGUAGE_TYPESCRIPT]: {
    [TEMPLATE_SAMPLE_APP]:
      'ts-basic',
    [TEMPLATE_STAGEHAND]:
      'ts-stagehand',
    [TEMPLATE_ADVANCED_SAMPLE]:
      'ts-advanced',
    [TEMPLATE_COMPUTER_USE]:
      'ts-cu',
    [TEMPLATE_CUA_SAMPLE]:
      'ts-cua',
  },
  [LANGUAGE_PYTHON]: {
    [TEMPLATE_SAMPLE_APP]:
      'python-basic',
    [TEMPLATE_BROWSER_USE]:
      'python-bu',
    [TEMPLATE_ADVANCED_SAMPLE]:
      'python-advanced',
    [TEMPLATE_COMPUTER_USE]:
      'python-cu',
  },
};

const CONFIG = {
  templateBasePath: path.resolve(__dirname, "../templates"),
  defaultAppName: "my-kernel-app",
  installCommands: {
    typescript: "npm install",
    python: "uv venv",
  },
};

// Helper for extracting error messages
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Helper to normalize language input (handle shorthand)
function normalizeLanguage(language: string): LanguageKey | null {
  if (language === LANGUAGE_SHORTHAND_TS) return LANGUAGE_TYPESCRIPT;
  if (language === LANGUAGE_SHORTHAND_PY) return LANGUAGE_PYTHON;
  return LANGUAGES[language as LanguageKey] ? (language as LanguageKey) : null;
}

// Validate if a template is available for the selected language
function isTemplateValidForLanguage(
  template: string,
  language: LanguageKey
): boolean {
  return (
    TEMPLATES[template as TemplateKey] !== undefined &&
    TEMPLATES[template as TemplateKey].languages.includes(language)
  );
}

// Get list of templates available for a language
function getAvailableTemplatesForLanguage(
  language: LanguageKey
): { name: string; value: string }[] {
  return Object.entries(TEMPLATES)
    .filter(([_, { languages }]) => languages.includes(language))
    .map(([value, { name, description }]) => ({
      name: `${name} - ${description}`,
      value,
    }));
}

// Prompt for app name if not provided
async function promptForAppName(providedAppName?: string): Promise<string> {
  if (providedAppName) return providedAppName;

  const { appName } = await inquirer.prompt([
    {
      type: "input",
      name: "appName",
      message: "What is the name of your project?",
      default: CONFIG.defaultAppName,
      validate: (input: string): boolean | string => {
        if (/^([A-Za-z\-_\d])+$/.test(input)) return true;
        return "Project name may only include letters, numbers, underscores and hyphens.";
      },
    },
  ]);

  return appName;
}

// Prompt for programming language
async function promptForLanguage(
  providedLanguage?: string,
  supportedLanguages: LanguageKey[] = Object.keys(LANGUAGES) as LanguageKey[]
): Promise<LanguageKey> {
  // If language provided, normalize it
  if (providedLanguage) {
    const normalizedLanguage = normalizeLanguage(providedLanguage);
    if (normalizedLanguage && supportedLanguages.includes(normalizedLanguage)) {
      return normalizedLanguage;
    }

    // If provided but not valid, we'll warn user later and prompt anyway
  }

  const { language } = await inquirer.prompt([
    {
      type: "list",
      name: "language",
      message: "Choose a programming language:",
      choices: Object.entries(LANGUAGES)
        .filter(([key]) => supportedLanguages.includes(key as LanguageKey))
        .map(([value, { name }]) => ({
          name,
          value,
        })),
    },
  ]);

  return language;
}

// Prompt for template
async function promptForTemplate(
  language: LanguageKey,
  providedTemplate?: string
): Promise<TemplateKey> {
  // If template provided and valid for language, use it
  if (
    providedTemplate &&
    isTemplateValidForLanguage(providedTemplate, language)
  ) {
    return providedTemplate as TemplateKey;
  }

  const { template } = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: "Choose a template:",
      choices: getAvailableTemplatesForLanguage(language),
    },
  ]);

  return template as TemplateKey;
}

// Ensure project directory exists and is empty
async function prepareProjectDirectory(appPath: string): Promise<void> {
  // Check if directory exists
  if (fs.existsSync(appPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `Directory ${path.basename(
          appPath
        )} already exists. Overwrite?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Operation cancelled."));
      process.exit(0);
    }

    fs.removeSync(appPath);
  }

  fs.mkdirSync(appPath, { recursive: true });
}

// Copy template files to project directory
function copyTemplateFiles(
  appPath: string,
  language: LanguageKey,
  template: TemplateKey
): void {
  const templatePath = path.resolve(
    CONFIG.templateBasePath,
    language,
    template
  );

  // Ensure the template exists
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  // Copy all files and handle _gitignore specially
  fs.copySync(templatePath, appPath, {
    filter: (src, dest) => {
      const filename = path.basename(src);
      if (filename === '_gitignore') {
        fs.copyFileSync(src, dest);
        // Rename it to .gitignore
        fs.renameSync(dest, path.join(path.dirname(dest), '.gitignore'));
        return false; // Skip the original copy since we handled it
      }
      return true; // Copy all other files normally
    }
  });
}

// Set up project dependencies based on language
async function setupDependencies(
  appPath: string,
  language: LanguageKey
): Promise<void> {
  const installCommand = CONFIG.installCommands[language];
  const spinner = ora(
    `Setting up ${LANGUAGES[language].name} environment...`
  ).start();

  try {
    execSync(installCommand, { cwd: appPath, stdio: "pipe" });
    spinner.succeed(
      `${LANGUAGES[language].name} environment set up successfully`
    );
    return;
  } catch (error) {
    spinner.fail(`Failed to set up ${LANGUAGES[language].name} environment`);
    console.error(chalk.red(`Error: ${getErrorMessage(error)}`));

    // Provide manual instructions
    if (language === LANGUAGE_TYPESCRIPT) {
      console.log(chalk.yellow("\nPlease install dependencies manually:"));
      console.log(`  cd ${path.basename(appPath)}`);
      console.log("  npm install");
    } else if (language === LANGUAGE_PYTHON) {
      console.log(chalk.yellow("\nPlease install dependencies manually:"));
      console.log(`  cd ${path.basename(appPath)}`);
      console.log("  uv venv && source .venv/bin/activate && uv sync");
    }
  }
}

// Print success message with next steps
function printNextSteps(
  appName: string,
  language: LanguageKey,
  template: TemplateKey
): void {
  // Determine which sample command to show based on language and template
  const deployCommand =
    language === LANGUAGE_TYPESCRIPT && (template === TEMPLATE_SAMPLE_APP || template === TEMPLATE_ADVANCED_SAMPLE)
      ? "kernel deploy index.ts"
      : language === LANGUAGE_TYPESCRIPT && template === TEMPLATE_STAGEHAND
      ? "kernel deploy index.ts --env OPENAI_API_KEY=XXX"
      : language === LANGUAGE_TYPESCRIPT && template === TEMPLATE_COMPUTER_USE
      ? "kernel deploy index.ts --env ANTHROPIC_API_KEY=XXX"
      : language === LANGUAGE_TYPESCRIPT && template === TEMPLATE_CUA_SAMPLE
      ? "kernel deploy index.ts --env OPENAI_API_KEY=XXX"
      : language === LANGUAGE_PYTHON && (template === TEMPLATE_SAMPLE_APP || template === TEMPLATE_ADVANCED_SAMPLE)
      ? "kernel deploy main.py"
      : language === LANGUAGE_PYTHON && template === TEMPLATE_BROWSER_USE
      ? "kernel deploy main.py --env OPENAI_API_KEY=XXX"
      : language === LANGUAGE_PYTHON && template === TEMPLATE_COMPUTER_USE
      ? "kernel deploy main.py --env ANTHROPIC_API_KEY=XXX"
      : "";

  console.log(
    chalk.green(`
🎉 Kernel app created successfully!

Next steps:
  brew install onkernel/tap/kernel
  cd ${appName}
  # Request early access for an API key: https://waitlist.onkernel.com/r/mZW2zz
  export KERNEL_API_KEY=<YOUR_API_KEY>
  ${deployCommand}
  ${INVOKE_SAMPLES[language][template]}
  # Do this in a separate tab
  export KERNEL_API_KEY=<YOUR_API_KEY>
  kernel logs ${REGISTERED_APP_NAMES[language][template]} --follow
  `)
  );
}

// Main program
const program = new Command();

program
  .name("create-kernel-app")
  .description("Create a new Kernel application")
  .version("0.1.0")
  .argument("[app-name]", "Name of your Kernel app")
  .option(
    "-l, --language <language>",
    `Programming language (${LANGUAGE_TYPESCRIPT}/${LANGUAGE_SHORTHAND_TS}, ${LANGUAGE_PYTHON}/${LANGUAGE_SHORTHAND_PY})`
  )
  .option(
    "-t, --template <template>",
    `Template type (${TEMPLATE_SAMPLE_APP}, ${TEMPLATE_BROWSER_USE}, ${TEMPLATE_STAGEHAND}, ${TEMPLATE_ADVANCED_SAMPLE}, ${TEMPLATE_COMPUTER_USE})`
  )
  .action(
    async (
      appName: string,
      options: { language?: string; template?: string }
    ) => {
      try {
        let normalizedLanguage: LanguageKey | null = null;
        let normalizedTemplate: TemplateKey | null = null;

        // Try to normalize and validate language if provided
        if (options.language?.toLowerCase()) {
          normalizedLanguage = normalizeLanguage(options.language);
          if (!normalizedLanguage) {
            console.log(
              chalk.yellow(
                `\nInvalid language '${options.language}'. Please select a valid language.`
              )
            );
          }
        }

        // Try to normalize and validate template if provided
        if (options.template?.toLowerCase()) {
          normalizedTemplate = options.template as TemplateKey;
          if (!TEMPLATES[normalizedTemplate]) {
            console.log(
              chalk.yellow(
                `\nInvalid template '${options.template}'. Please select a valid template.`
              )
            );
            normalizedTemplate = null;
          }
        }

        // If both are provided, validate the combination
        if (normalizedLanguage && normalizedTemplate) {
          console.log(normalizedLanguage, normalizedTemplate);
          const isValid = isTemplateValidForLanguage(
            normalizedTemplate,
            normalizedLanguage
          );
          if (!isValid) {
            const errorMessage =
              `Template '${normalizedTemplate}' is not available for ${LANGUAGES[normalizedLanguage].name}. ` +
              `This template is only available for: ${TEMPLATES[
                normalizedTemplate as TemplateKey
              ].languages
                .map((l) => LANGUAGES[l].name)
                .join(", ")}`;
            console.log(chalk.yellow(`\n${errorMessage}`));
            // Reset both to force prompting
            normalizedLanguage = null;
            normalizedTemplate = null;
          }
        }

        // Get user inputs (with prompts if needed)
        const finalAppName = await promptForAppName(appName);
        const language = await promptForLanguage(
          normalizedLanguage || undefined
        );
        const template = await promptForTemplate(
          language,
          normalizedTemplate || undefined
        );

        const appPath = path.resolve(finalAppName);

        // Set up the project
        console.log(
          chalk.blue(
            `\nCreating a new ${LANGUAGES[language].name} ${TEMPLATES[template].name}\n`
          )
        );

        await prepareProjectDirectory(appPath);
        copyTemplateFiles(appPath, language, template);
        await setupDependencies(appPath, language);
        printNextSteps(finalAppName, language, template);
      } catch (error: unknown) {
        console.error(chalk.red("An error occurred:"));
        console.error(getErrorMessage(error));
        process.exit(1);
      }
    }
  );

program.parse();
