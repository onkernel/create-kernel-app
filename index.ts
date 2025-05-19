#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for better type safety
type LanguageKey = 'typescript' | 'python';
type TemplateKey = 'sample-app' | 'browser-use';
type LanguageInfo = { name: string; shorthand: string };
type TemplateInfo = { name: string; description: string; languages: LanguageKey[] };

// String constants
const LANGUAGE_TYPESCRIPT = 'typescript';
const LANGUAGE_PYTHON = 'python';
const TEMPLATE_SAMPLE_APP = 'sample-app';
const TEMPLATE_BROWSER_USE = 'browser-use';
const LANGUAGE_SHORTHAND_TS = 'ts';
const LANGUAGE_SHORTHAND_PY = 'py';

// Configuration constants
const LANGUAGES: Record<LanguageKey, LanguageInfo> = {
  [LANGUAGE_TYPESCRIPT]: { name: 'TypeScript', shorthand: LANGUAGE_SHORTHAND_TS },
  [LANGUAGE_PYTHON]: { name: 'Python', shorthand: LANGUAGE_SHORTHAND_PY }
};

const TEMPLATES: Record<TemplateKey, TemplateInfo> = {
  [TEMPLATE_SAMPLE_APP]: { 
    name: 'Sample App', 
    description: 'Extracts page title using Playwright',
    languages: [LANGUAGE_TYPESCRIPT, LANGUAGE_PYTHON]
  },
  [TEMPLATE_BROWSER_USE]: {
    name: 'Browser Use',
    description: 'Implements Browser Use SDK',
    languages: [LANGUAGE_PYTHON]
  }
};

const INVOKE_SAMPLES: Record<string, string> = {
  'ts-basic': 'kernel invoke ts-basic get-page-title --payload \'{"url": "https://www.google.com"}\'',
  'py-basic': 'kernel invoke py-basic get-page-title --payload \'{"url": "https://www.google.com"}\'',
  'python-bu': 'kernel invoke python-bu bu-task --payload \'{"task": "Compare the price of gpt-4o and DeepSeek-V3", "openai_api_key": "XXX"}\''
};

const CONFIG = {
  templateBasePath: path.resolve(__dirname, '../templates'),
  defaultAppName: 'my-kernel-app',
  installCommands: {
    typescript: 'npm install',
    python: 'uv venv'
  }
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
  return (LANGUAGES[language as LanguageKey]) ? language as LanguageKey : null;
}

// Validate if a template is available for the selected language
function isTemplateValidForLanguage(template: string, language: LanguageKey): boolean {
  return (
    TEMPLATES[template as TemplateKey] !== undefined && 
    TEMPLATES[template as TemplateKey].languages.includes(language)
  );
}

// Get list of templates available for a language
function getAvailableTemplatesForLanguage(language: LanguageKey): { name: string; value: string }[] {
  return Object.entries(TEMPLATES)
    .filter(([_, { languages }]) => languages.includes(language))
    .map(([value, { name, description }]) => ({ 
      name: `${name} - ${description}`, 
      value 
    }));
}

// Prompt for app name if not provided
async function promptForAppName(providedAppName?: string): Promise<string> {
  if (providedAppName) return providedAppName;
  
  const { appName } = await inquirer.prompt([{
    type: 'input',
    name: 'appName',
    message: 'What is the name of your project?',
    default: CONFIG.defaultAppName,
    validate: (input: string): boolean | string => {
      if (/^([A-Za-z\-_\d])+$/.test(input)) return true;
      return 'Project name may only include letters, numbers, underscores and hashes.';
    }
  }]);
  
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
  
  const { language } = await inquirer.prompt([{
    type: 'list',
    name: 'language',
    message: 'Choose a programming language:',
    choices: Object.entries(LANGUAGES)
      .filter(([key]) => supportedLanguages.includes(key as LanguageKey))
      .map(([value, { name }]) => ({ 
        name, value 
      }))
  }]);
  
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
  
  const { template } = await inquirer.prompt([{
    type: 'list',
    name: 'template',
    message: 'Choose a template:',
    choices: getAvailableTemplatesForLanguage(language),
  }]);
  
  return template as TemplateKey;
}

// Ensure project directory exists and is empty
async function prepareProjectDirectory(appPath: string): Promise<void> {
  // Check if directory exists
  if (fs.existsSync(appPath)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `Directory ${path.basename(appPath)} already exists. Overwrite?`,
      default: false
    }]);
    
    if (!overwrite) {
      console.log(chalk.yellow('Operation cancelled.'));
      process.exit(0);
    }
    
    fs.removeSync(appPath);
  }
  
  fs.mkdirSync(appPath, { recursive: true });
}

// Copy template files to project directory
function copyTemplateFiles(appPath: string, language: LanguageKey, template: TemplateKey): void {
  const templatePath = path.resolve(
    CONFIG.templateBasePath,
    language,
    template
  );
  
  // Ensure the template exists
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  
  fs.copySync(templatePath, appPath);
}

// Set up project dependencies based on language
async function setupDependencies(appPath: string, language: LanguageKey): Promise<void> {
  const installCommand = CONFIG.installCommands[language];
  const spinner = ora(`Setting up ${LANGUAGES[language].name} environment...`).start();
  
  try {
    execSync(installCommand, { cwd: appPath, stdio: 'pipe' });
    spinner.succeed(`${LANGUAGES[language].name} environment set up successfully`);
    return;
  } catch (error) {
    spinner.fail(`Failed to set up ${LANGUAGES[language].name} environment`);
    console.error(chalk.red(`Error: ${getErrorMessage(error)}`));
    
    // Provide manual instructions
    if (language === LANGUAGE_TYPESCRIPT) {
      console.log(chalk.yellow('\nPlease install dependencies manually:'));
      console.log(`  cd ${path.basename(appPath)}`);
      console.log('  npm install');
    } else if (language === LANGUAGE_PYTHON) {
      console.log(chalk.yellow('Please follow the manual setup instructions in the README.'));
    }
  }
}

// Print success message with next steps
function printNextSteps(appName: string, language: LanguageKey, template: TemplateKey): void {
  // Determine which sample command to show based on language and template
  let sampleCommand = '';
  if (language === LANGUAGE_TYPESCRIPT) {
    sampleCommand = INVOKE_SAMPLES['ts-basic'];
  } else if (language === LANGUAGE_PYTHON) {
    sampleCommand = template === TEMPLATE_SAMPLE_APP 
      ? INVOKE_SAMPLES['py-basic'] 
      : INVOKE_SAMPLES['python-bu'];
  }
  
  console.log(chalk.green(`
🎉 Kernel app created successfully!

Next steps:
  cd ${appName}
  ${language === LANGUAGE_PYTHON ? 'source .venv/bin/activate && uv pip install .' : ''}
  export KERNEL_API_KEY=<YOUR_API_KEY>
  kernel deploy ${language === LANGUAGE_TYPESCRIPT ? 'index.ts' : 'main.py'}
  kernel invoke ${sampleCommand}
  `));
}

// Validate language and template combination only when both are explicitly provided
function validateLanguageTemplateCombination(language: LanguageKey | null, template: string | undefined): { isValid: boolean; errorMessage?: string } {
  // If either is not provided, consider it valid (will be prompted later)
  if (!language || !template) {
    return { isValid: true };
  }
  
  if (!TEMPLATES[template as TemplateKey]) {
    return { 
      isValid: false, 
      errorMessage: `Invalid template '${template}'. Available templates: ${Object.keys(TEMPLATES).join(', ')}` 
    };
  }
  
  if (!isTemplateValidForLanguage(template, language)) {
    return { 
      isValid: false, 
      errorMessage: `Template '${template}' is not available for ${LANGUAGES[language].name}. ` +
        `This template is only available for: ${TEMPLATES[template as TemplateKey].languages.map(l => LANGUAGES[l].name).join(', ')}` 
    };
  }
  
  return { isValid: true };
}

// Main program
const program = new Command();

program
  .name('create-kernel-app')
  .description('Create a new Kernel application')
  .version('0.1.0')
  .argument('[app-name]', 'Name of your Kernel app')
  .option('-l, --language <language>', `Programming language (${LANGUAGE_TYPESCRIPT}/${LANGUAGE_SHORTHAND_TS}, ${LANGUAGE_PYTHON}/${LANGUAGE_SHORTHAND_PY})`)
  .option('-t, --template <template>', `Template type (${TEMPLATE_SAMPLE_APP}, ${TEMPLATE_BROWSER_USE})`)
  .action(async (appName: string, options: { language?: string; template?: string }) => {
    try {
      // Only validate if both language and template are provided
      if (options.language && options.template) {
        const normalizedLanguage = normalizeLanguage(options.language);
        const validation = validateLanguageTemplateCombination(normalizedLanguage, options.template);
        
        if (!validation.isValid) {
          console.error(chalk.red('Error:'), validation.errorMessage);
          console.log(chalk.yellow('\nPlease try again with a valid combination.'));
          process.exit(1);
        }
      }
      
      // Get user inputs (with prompts if needed)
      const finalAppName = await promptForAppName(appName);
      const language = await promptForLanguage(options.language);
      const template = await promptForTemplate(language, options.template);
      
      const appPath = path.resolve(finalAppName);
      
      // Set up the project
      console.log(chalk.blue(`\nCreating a new ${LANGUAGES[language].name} ${TEMPLATES[template].name}\n`));
      
      await prepareProjectDirectory(appPath);
      copyTemplateFiles(appPath, language, template);
      await setupDependencies(appPath, language);
      printNextSteps(finalAppName, language, template);
      
    } catch (error: unknown) {
      console.error(chalk.red('An error occurred:'));
      console.error(getErrorMessage(error));
      process.exit(1);
    }
  });

program.parse();