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
- ⚡️ Automatic dependency setup
- 🫶 Interactive CLI with helpful prompts

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

### Examples

Create a TypeScript application with a sample app:
```bash
npx create-kernel-app my-app --language typescript --template sample-app
```

Create a Python application with a sample app:
```bash
npx create-kernel-app my-app --language python --template sample-app
```

Create a Python application with Browser Use template:
```bash
npx create-kernel-app my-app --language python --template browser-use
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
   kernel deploy index.ts  # for TypeScript
   kernel deploy main.py   # for Python
   ```

5. Try out your application using the provided sample commands in the project README.

## Documentation

For more information about Kernel and its features, visit:
- [Kernel Documentation](https://docs.onkernel.com/quickstart)
- [Kernel Homepage](https://onkernel.com)

## Contributing

Contributions are welcome! Please feel free to submit a pull request. See [Contributing](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md)

## License

MIT © [Kernel](https://onkernel.com)

