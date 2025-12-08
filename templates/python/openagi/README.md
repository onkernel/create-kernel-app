# Kernel Python Sample App - OpenAGI Lux

This is a Kernel application that demonstrates using [OpenAGI's Lux](https://agiopen.org) computer-use model for browser automation.

## What is OpenAGI Lux?

OpenAGI's Lux is a vision-language model specifically designed to control computers by:
- Analyzing screenshots to understand the current UI state
- Deciding on the next action (click, type, scroll, etc.)
- Executing actions in a screenshot-action loop until the task is complete

## How It Works

This integration connects OpenAGI's Lux model to Kernel's cloud browsers using custom providers:

1. **`KernelScreenshotProvider`**: Captures screenshots using Kernel's Computer Controls API
2. **`KernelActionHandler`**: Translates Lux actions (click, type, scroll) to Kernel commands
3. **`KernelBrowserSession`**: Manages browser lifecycle

## Quick Start

```bash
# Install the Kernel CLI
brew install onkernel/tap/kernel

# Login to Kernel
kernel login

# Deploy the app
kernel deploy main.py --env OAGI_API_KEY=your_openagi_api_key

# Invoke the action
kernel invoke python-openagi openagi-task --payload '{"task": "Go to https://news.ycombinator.com and list the top 5 articles"}'

# View logs (in a separate terminal)
kernel logs python-openagi --follow
```

## API Keys

- **Kernel**: Get your API key at [dashboard.onkernel.com](https://dashboard.onkernel.com)
- **OpenAGI**: Get your API key at [developer.agiopen.org](https://developer.agiopen.org)

## Resources

- [Kernel Documentation](https://onkernel.com/docs/quickstart)
- [OpenAGI Documentation](https://agiopen.org)
- [Original Integration Repo](https://github.com/onkernel/kernel-oagi)
