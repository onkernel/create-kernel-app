# create-kernel-app

A CLI tool to create the scaffolding for a  new Kernel applications. This tool helps you get started with building browser automation applications using Kernel's platform.

## Features

- 🚀 Quick project scaffolding for Kernel applications
- 🔄 Support for multiple programming languages:
  - TypeScript
  - Python
- 📦 Multiple template options:
  - Sample App: A basic template that extracts page titles using Playwright
  - Browser Use: A template implementing the Browser Use SDK
  - Stagehand: A template implementing the Stagehand SDK
- ⚡️ Automatic dependency setup
- 🫶 Interactive CLI

## Set-Up

```bash
npx @onkernel/create-kernel-app
```

## Usage

Create a new Kernel application by running:

```bash
create-kernel-app [app-name] [options]
```

### Options

- `-l, --language <language>`: Choose your programming language
  - TypeScript: `typescript` or `ts`
  - Python: `python` or `py`
- `-t, --template <template>`: Select a template
  - `sample-app`: Basic template with Playwright integration
  - `browser-use`: Template with Browser Use SDK (Python only)
  - `stagehand`: Template with Stagehand SDK (Typescript only)
  - `advanced-sample`: Implements sample apps using advanced Kernel configs
  - `computer-use`: Implements a prompt loop using Anthropic Computer Use

### Examples

Create a TypeScript application with a sample app:
```bash
npx @onkernel/create-kernel-app my-app --language typescript --template sample-app
```

Create a Typescript application with Stagehand template:
```bash
npx @onkernel/create-kernel-app my-app --language typescript --template stagehand
```

Create a Typescript application with Computer Use template:
```bash
npx @onkernel/create-kernel-app my-app --language typescript --template computer-use
```

Create a Python application with a sample app:
```bash
npx @onkernel/create-kernel-app my-app --language python --template sample-app
```

Create a Python application with Browser Use template:
```bash
npx @onkernel/create-kernel-app my-app --language python --template browser-use
```
```

## Next Steps

After creating your application:

1. Navigate to your project directory:
```bash
cd my-app
```

2. Set up your environment:
- For TypeScript: `npm install`
- For Python: `uv venv && source .venv/bin/activate && uv sync`

3. Set your Kernel API key:
```bash
export KERNEL_API_KEY=<YOUR_API_KEY>
```

4. Deploy your application:
```bash
# Typscript
kernel deploy index.ts  # --env OPENAI_API_KEY=XXX if Stagehand; --env ANTHROPIC_API_KEY=XXX if Computer Use

# Python
kernel deploy main.py   # --env OPENAI_API_KEY=XXX if Browser Use
```

If deploying an app that requires environment variables, make sure to [set them](https://docs.onkernel.com/launch/deploy#environment-variables) when you `deploy`.

5. Invoke your application:
```bash
# Typescript + Sample App
kernel invoke ts-basic get-page-title --payload '{"url": "https://www.google.com"}'

# Typescript + Stagehand
kernel invoke ts-stagehand stagehand-task --payload '{"query": "Best wired earbuds"}'

# Typescript + Computer Use
kernel invoke ts-cu cu-task --payload '{"query": "Search for the top 3 restaurants in NYC according to Pete Wells"}'

# Python + Sample App
kernel invoke python-basic get-page-title --payload '{"url": "https://www.google.com"}'

# Python + Browser Use
kernel invoke python-bu bu-task --payload '{"task": "Compare the price of gpt-4o and DeepSeek-V3"}'
```

## Sample apps reference

These are the sample apps currently available when you run `npx @onkernel/create-kernel-app`:

| Template | Description | Framework | Query Parameters |
|----------|-------------|-----------|------------------|
| **sample-app** | Returns the page title of a specified URL | Playwright | `{ url }` |
| **browser-use** | Completes a specified task | Browser Use | `{ task }` |
| **stagehand** | Returns the first result of a specified Google search | Stagehand | `{ query }` |
| **advanced-sample** | Implements sample apps using advanced Kernel configs | n/a |
| **computer-use** | Implements a prompt loop | Anthropic Computer Use API | `{ query }` |

## Documentation

For more information about Kernel and its features, visit:
- [Kernel Documentation](https://docs.onkernel.com/quickstart)
- [Kernel Homepage](https://onkernel.com)

## Contributing

Contributions are welcome! Please feel free to submit a pull request. See [Contributing](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md)

## License

MIT © [Kernel](https://onkernel.com)

