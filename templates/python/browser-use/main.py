from langchain_openai import ChatOpenAI
from browser_use import Agent, BrowserSession
import kernel
from kernel import Kernel
from typing import TypedDict

client = Kernel()

app = kernel.App("python-bu")

class TaskInput(TypedDict):
    task: str
    
# LLM API Keys are set in the environment during `kernel deploy <filename> -e OPENAI_API_KEY=XXX`
# See https://docs.onkernel.com/launch/deploy#environment-variables
llm = ChatOpenAI(model="gpt-4o-mini")


# Define a subclass of BrowserSession that overrides _setup_viewports (which mishandles resizeing on connecting via cdp)
class BrowserSessionCustomResize(BrowserSession):
    async def _setup_viewports(self) -> None:
        """Resize any existing page viewports to match the configured size, set up storage_state, permissions, geolocation, etc."""

        assert self.browser_context, 'BrowserSession.browser_context must already be set up before calling _setup_viewports()'

        self.browser_profile.window_size = {"width": 1024, "height": 786}
        self.browser_profile.viewport = {"width": 1024, "height": 786}
        self.browser_profile.screen = {"width": 1024, "height": 786}
        self.browser_profile.device_scale_factor = 1.0

        # log the viewport settings to terminal
        viewport = self.browser_profile.viewport
        print(
            '📐 Setting up viewport: '
            + f'headless={self.browser_profile.headless} '
            + (
                f'window={self.browser_profile.window_size["width"]}x{self.browser_profile.window_size["height"]}px '
                if self.browser_profile.window_size
                else '(no window) '
            )
            + (
                f'screen={self.browser_profile.screen["width"]}x{self.browser_profile.screen["height"]}px '
                if self.browser_profile.screen
                else ''
            )
            + (f'viewport={viewport["width"]}x{viewport["height"]}px ' if viewport else '(no viewport) ')
            + f'device_scale_factor={self.browser_profile.device_scale_factor or 1.0} '
            + f'is_mobile={self.browser_profile.is_mobile} '
            + (f'color_scheme={self.browser_profile.color_scheme.value} ' if self.browser_profile.color_scheme else '')
            + (f'locale={self.browser_profile.locale} ' if self.browser_profile.locale else '')
            + (f'timezone_id={self.browser_profile.timezone_id} ' if self.browser_profile.timezone_id else '')
            + (f'geolocation={self.browser_profile.geolocation} ' if self.browser_profile.geolocation else '')
            + (f'permissions={",".join(self.browser_profile.permissions or ["<none>"])} ')
        )

        # if we have any viewport settings in the profile, make sure to apply them to the entire browser_context as defaults
        if self.browser_profile.permissions:
            try:
                await self.browser_context.grant_permissions(self.browser_profile.permissions)
            except Exception as e:
                self.logger.warning(
                    f'⚠️ Failed to grant browser permissions {self.browser_profile.permissions}: {type(e).__name__}: {e}'
                )
        try:
            if self.browser_profile.default_timeout:
                self.browser_context.set_default_timeout(self.browser_profile.default_timeout)
            if self.browser_profile.default_navigation_timeout:
                self.browser_context.set_default_navigation_timeout(self.browser_profile.default_navigation_timeout)
        except Exception as e:
            self.logger.warning(
                f'⚠️ Failed to set playwright timeout settings '
                f'cdp_api={self.browser_profile.default_timeout} '
                f'navigation={self.browser_profile.default_navigation_timeout}: {type(e).__name__}: {e}'
            )
        try:
            if self.browser_profile.extra_http_headers:
                self.browser_context.set_extra_http_headers(self.browser_profile.extra_http_headers)
        except Exception as e:
            self.logger.warning(
                f'⚠️ Failed to setup playwright extra_http_headers: {type(e).__name__}: {e}'
            )  # dont print the secret header contents in the logs!

        try:
            if self.browser_profile.geolocation:
                await self.browser_context.set_geolocation(self.browser_profile.geolocation)
        except Exception as e:
            self.logger.warning(
                f'⚠️ Failed to update browser geolocation {self.browser_profile.geolocation}: {type(e).__name__}: {e}'
            )

        await self.load_storage_state()

        page = None

        for page in self.browser_context.pages:
            # apply viewport size settings to any existing pages
            if viewport:
                await page.set_viewport_size(viewport)

            # show browser-use dvd screensaver-style bouncing loading animation on any about:blank pages
            if page.url == 'about:blank':
                await self._show_dvd_screensaver_loading_animation(page)

        page = page or (await self.browser_context.new_page())

        if (not viewport) and (self.browser_profile.window_size is not None) and not self.browser_profile.headless:
            # attempt to resize the actual browser window

            # cdp api: https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setWindowBounds
            try:
                cdp_session = await page.context.new_cdp_session(page)
                window_id_result = await cdp_session.send('Browser.getWindowForTarget')
                await cdp_session.send(
                    'Browser.setWindowBounds',
                    {
                        'windowId': window_id_result['windowId'],
                        'bounds': {
                            **self.browser_profile.window_size,
                            'windowState': 'normal',  # Ensure window is not minimized/maximized
                        },
                    },
                )
                await cdp_session.detach()
            except Exception as e:
                _log_size = lambda size: f'{size["width"]}x{size["height"]}px'
                try:
                    # fallback to javascript resize if cdp setWindowBounds fails
                    await page.evaluate(
                        """(width, height) => {window.resizeTo(width, height)}""",
                        **self.browser_profile.window_size,
                    )
                    return
                except Exception as e:
                    pass

                self.logger.warning(
                    f'⚠️ Failed to resize browser window to {_log_size(self.browser_profile.window_size)} using CDP setWindowBounds: {type(e).__name__}: {e}'
                )


@app.action("bu-task")
async def bu_task(ctx: kernel.KernelContext, input_data: TaskInput):
    """
    A function that runs a Browser Use agent
    
    Args:
        ctx: Kernel context containing invocation information
        input_data: An object with a BU task
        
    Returns:
        An object with final_result and errors properties
    """
    
    kernel_browser = client.browsers.create(invocation_id=ctx.invocation_id, stealth=True)
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)
    #######################################
    # Your Browser Use implementation here
    #######################################
    agent = Agent(
        #task="Compare the price of gpt-4o and DeepSeek-V3",
        task=input_data["task"],
        llm=llm,
        browser_session=BrowserSessionCustomResize(cdp_url=kernel_browser.cdp_ws_url)
    )
    result = await agent.run()
    if result.final_result() is not None:
      return {"final_result": result.final_result()}
    return {"errors": result.errors()}
